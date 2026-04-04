import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import { requireAdmin } from "~/lib/session.server";
import { useAdminLayout } from "~/routes/admin";
import { getMemberById, getTodayAttendanceAll, listLocations, getActiveSchedulesForDate, listSevaRoles, markAttendance, getLocationsWithAnySchedule, type ScheduleWithLocation } from "~/lib/db.server";
import { checkGeofence } from "~/lib/geofence";
import { checkRateLimit } from "~/lib/ratelimit.server";

export const meta: MetaFunction = () => [{ title: "My Attendance — Sevadal Admin" }];
function todayISO(){ return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function nowHHMM(){ return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Kolkata"}).replace(".",":"); }
function fmtTime(iso:string|null){ if(!iso)return""; const u=iso.endsWith("Z")?iso:iso+"Z"; return new Date(u).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}); }
function isActive(s:ScheduleWithLocation,hhmm:string){ if(s.all_day)return true; if(!s.start_time||!s.end_time)return true; return hhmm>=s.start_time&&hhmm<=s.end_time; }

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);

  // Super admins are NOT counted in attendance — redirect them away
  if (session.isSuperAdmin) {
    const { redirect } = await import("@remix-run/cloudflare");
    throw redirect("/admin");
  }

  const today   = todayISO();
  const [member, todayRecs, locations, schedules, sevaRoles, allScheduledLocationIds] = await Promise.all([
    getMemberById(DB,session.memberId), getTodayAttendanceAll(DB,session.memberId,today),
    listLocations(DB,true), getActiveSchedulesForDate(DB,today), listSevaRoles(DB,true),
    getLocationsWithAnySchedule(DB),
  ]);
  if (!member) throw redirect("/auth/logout");
  return json({ member, todayRecs, locations, schedules, sevaRoles, today, allScheduledLocationIds });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const ip2 = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const [rl1, rl2] = await Promise.all([
    checkRateLimit(DB, `attend:member:${session.memberId}`, 10, 3600),
    checkRateLimit(DB, `attend:ip:${ip2}`, 30, 3600),
  ]);
  if (!rl1.allowed || !rl2.allowed) return json({error:"Too many attempts. Please wait or ask admin."},{status:429});
  const form     = await request.formData();
  const lat      = parseFloat(form.get("lat") as string);
  const lng      = parseFloat(form.get("lng") as string);
  const accuracy = parseFloat(form.get("accuracy") as string);
  const sevaRole = (form.get("sevaRole") as string)?.trim()||null;
  const custom   = (form.get("customSeva") as string)?.trim()||null;
  const finalSeva= sevaRole==="__custom__"?custom:sevaRole;
  let ids:number[]=[];
  try{ids=JSON.parse(form.get("scheduleIds") as string);}catch{ids=[0];}
  if (!ids.length) ids=[0];
  if (isNaN(lat)||isNaN(lng)) return json({error:"Cannot get location. Enable GPS."},{status:400});
  const today    = todayISO();
  const locs     = await listLocations(DB,true);
  const geo      = checkGeofence(lat,lng,locs);
  if (!geo) return json({error:"No active locations."},{status:400});
  if (!geo.allowed) return json({error:`${geo.distanceMeters}m from ${geo.locationName}. Must be within ${geo.radiusMeters}m.`},{status:403});
  const member   = await getMemberById(DB,session.memberId);
  if (!member) throw redirect("/auth/logout");
  const schedules= await getActiveSchedulesForDate(DB,today);
  for (const schedId of ids) {
    const sched=schedules.find(s=>s.id===schedId);
    await markAttendance(DB,{memberId:session.memberId,memberName:member.name,sevaRole:finalSeva,locationId:sched?sched.location_id:geo.locationId,locationName:sched?sched.location_name:geo.locationName,date:today,lat,lng,accuracy,distanceMeters:geo.distanceMeters,scheduleId:schedId,satsangType:sched?.satsang_type_name??null,sessionLabel:sched?.label??null,markedById:null,markedByName:null});
  }
  return json({success:true,loc:geo.locationName});
}

type G={status:"idle"}|{status:"loading"}|{status:"success";lat:number;lng:number;accuracy:number}|{status:"error";message:string};

export default function AdminMarkSelfPage() {
  const { member, todayRecs, locations, schedules, sevaRoles, today, allScheduledLocationIds } = useLoaderData<typeof loader>();
  const ad = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const submitting = nav.state==="submitting";
  const [gps,setGps]=useState<G>({status:"idle"});
  const reqGps=useCallback(()=>{
    setGps({status:"loading"});
    navigator.geolocation.getCurrentPosition(
      p=>setGps({status:"success",lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>setGps({status:"error",message:e.code===1?"Location denied. Allow permission.":"Cannot get GPS."}),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
  },[]);
  useEffect(()=>{if(locations.length>0&&todayRecs.length===0)reqGps();},[]);

  const hhmm=nowHHMM();
  const activeSess=schedules.filter(s=>isActive(s as any,hhmm));
  const noSchedLocs=locations.filter(l=>!allScheduledLocationIds.includes(l.id));
  const markedIds=new Set(todayRecs.map(r=>r.schedule_id));
  const [selIds,setSelIds]=useState<Set<number>>(new Set());
  const [seva,setSeva]=useState("");
  const [custom,setCustom]=useState("");
  const sessItems=[...activeSess.map(s=>({id:s.id,label:s.label,type:s.satsang_type_name,loc:s.location_name})),...(noSchedLocs.length>0?[{id:0,label:"Open Seva",type:null,loc:noSchedLocs[0]?.name}]:[])];
  useEffect(()=>{ setSelIds(new Set(sessItems.filter(s=>!markedIds.has(s.id)).map(s=>s.id))); },[]);

  const { adminName } = useAdminLayout();

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">✅ My Attendance</h1>
        <span style={{fontSize:"13px",color:"var(--gray-400)"}}>{member.name} · {today}</span>
      </div>
      <div className="admin-content" style={{maxWidth:"540px"}}>
        {ad?.success&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",padding:"28px",background:"var(--success-light)",borderRadius:"var(--radius-lg)",border:"1px solid #86efac",textAlign:"center",marginBottom:"20px"}}>
            <div style={{fontSize:"40px"}}>✅</div>
            <div style={{fontFamily:"var(--font-heading)",fontWeight:"700",fontSize:"18px",color:"var(--success)"}}>Attendance Marked!</div>
            <div style={{fontSize:"13px",color:"#15803d"}}>{ad.loc}</div>
          </div>
        )}
        {!ad?.success&&(
          <div className="card">
            <div className="card-body" style={{display:"flex",flexDirection:"column",gap:"16px"}}>
              <div className="alert alert-info" style={{fontSize:"12px"}}>
                ℹ️ As an admin, you are counted in attendance. Mark your own attendance here.
              </div>
              <div className={`gps-status ${gps.status==="success"?"gps-inside":gps.status==="error"?"gps-outside":"gps-loading"}`}>
                <div className="gps-dot"/>
                <span style={{fontSize:"13px"}}>{gps.status==="loading"&&"Getting location…"}{gps.status==="idle"&&"Tap to get GPS"}{gps.status==="success"&&`GPS ready · ±${Math.round(gps.accuracy)}m`}{gps.status==="error"&&gps.message}</span>
              </div>

              {sessItems.map(sess=>{
                const marked=markedIds.has(sess.id), sel=selIds.has(sess.id);
                return (
                  <label key={sess.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px",borderRadius:"var(--radius-sm)",border:`1.5px solid ${marked?"var(--success)":sel?"var(--primary)":"var(--gray-200)"}`,background:marked?"var(--success-light)":sel?"var(--primary-light)":"white",cursor:marked?"default":"pointer"}}>
                    <input type="checkbox" checked={marked||sel} disabled={marked} onChange={()=>!marked&&setSelIds(p=>{const n=new Set(p);n.has(sess.id)?n.delete(sess.id):n.add(sess.id);return n;})} style={{width:"18px",height:"18px",accentColor:"var(--primary)"}} title={marked?"Already marked for this session":sel?"Will mark for this session":"Click to select this session"}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:"600",fontSize:"14px"}}>{sess.label}</div>
                      <div style={{fontSize:"11px",color:"var(--gray-400)"}}>{sess.type&&`${sess.type} · `}{sess.loc}</div>
                    </div>
                    {marked&&<span className="badge badge-success">Marked</span>}
                  </label>
                );
              })}

              {selIds.size>0&&(
                <div className="form-group">
                  <label className="form-label">Your Seva Role Today *</label>
                  <select className="form-select" value={seva} onChange={e=>setSeva(e.target.value)} title="Select what seva you are doing today">
                    <option value="">— Select seva role —</option>
                    {sevaRoles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
                    <option value="__custom__">Other (type below…)</option>
                  </select>
                  {seva==="__custom__"&&<input type="text" className="form-input" style={{marginTop:"8px"}} placeholder="Type seva role" value={custom} onChange={e=>setCustom(e.target.value)}/>}
                </div>
              )}

              {ad?.error&&<div className="alert alert-error"><span>⚠️</span><span>{ad.error}</span></div>}

              {gps.status!=="success"?(
                <button type="button" className="btn btn-primary btn-lg btn-full" onClick={reqGps} title="Get current GPS location — must be at the satsang venue">📍 Get My Location</button>
              ):selIds.size===0?(
                <div className="alert alert-success">✅ All sessions marked for today!</div>
              ):(
                <Form method="post">
                  <input type="hidden" name="lat"         value={gps.status==="success"?gps.lat:""}/>
                  <input type="hidden" name="lng"         value={gps.status==="success"?gps.lng:""}/>
                  <input type="hidden" name="accuracy"    value={gps.status==="success"?gps.accuracy:""}/>
                  <input type="hidden" name="sevaRole"    value={seva}/>
                  <input type="hidden" name="customSeva"  value={custom}/>
                  <input type="hidden" name="scheduleIds" value={JSON.stringify(Array.from(selIds))}/>
                  <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={submitting||!seva} title="Mark your attendance — you must be physically at the location">
                    {submitting?<><span className="spinner" style={{borderTopColor:"white"}}/> Marking…</>:"✅ Mark Present"}
                  </button>
                </Form>
              )}
              {gps.status==="error"&&<button className="btn btn-outline btn-md btn-full" type="button" onClick={reqGps} title="Try getting GPS location again">🔄 Retry GPS</button>}
            </div>
          </div>
        )}

        {todayRecs.length>0&&(
          <div className="card" style={{marginTop:"20px"}}>
            <div className="card-header"><h3>Today's Records</h3></div>
            {todayRecs.map(r=>(
              <div key={r.id} className="history-item">
                <div>
                  <div className="history-item__date">{r.session_label||"Open Seva"}</div>
                  <div className="history-item__meta">{r.location_name} · {fmtTime(r.marked_at)}{r.seva_role?` · ${r.seva_role}`:""}</div>
                </div>
                <span className="badge badge-success">Present</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
