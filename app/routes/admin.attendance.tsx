import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { useConfirm } from "~/components/ConfirmModal";
import { Toast } from "~/components/Toast";
import { requireAdmin } from "~/lib/session.server";
import { useAdminLayout } from "~/routes/admin";
import {
  getAttendanceLog, getAbsentList, markAttendance,
  listMembers, listLocations, listSevaRoles,
  deleteAttendance, updateAttendance, getMemberById,
} from "~/lib/db.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";
import { logAudit, getClientIp } from "~/lib/audit.server";

export const meta: MetaFunction = () => [{ title: "Attendance — Sevadal Admin" }];
function todayISO()    { return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function fmtTime(iso:string|null){ if(!iso)return"—"; const u=iso.endsWith("Z")?iso:iso+"Z"; return new Date(u).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}); }
function fmtDate(iso:string)     { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); }
const PAGE=50;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  const url      = new URL(request.url);
  const date     = url.searchParams.get("date")       || todayISO();
  const toDate   = url.searchParams.get("toDate")     || date;
  const page     = parseInt(url.searchParams.get("page")||"1");
  const tab      = url.searchParams.get("tab")        || "present";
  const search   = url.searchParams.get("search")     || "";
  const filterRole = url.searchParams.get("role")     || "";
  const filterLoc  = url.searchParams.get("loc")      || "";
  const filterSess = url.searchParams.get("sess")     || "";
  const sortBy   = url.searchParams.get("sortBy")     || "marked_at";
  const sortDir  = (url.searchParams.get("sortDir")   || "desc") as "asc"|"desc";
  const absSortBy  = url.searchParams.get("absSortBy")|| "name";
  const absSortDir = (url.searchParams.get("absSortDir")||"asc") as "asc"|"desc";
  const isRange  = toDate !== date;

  const [presentData, absentList, allMembers, locations, sevaRoles] = await Promise.all([
    getAttendanceLog(DB, date, page, PAGE, { sevaRole:filterRole||undefined, location:filterLoc||undefined, search:search||undefined, sortBy, sortDir, toDate: isRange ? toDate : undefined }),
    getAbsentList(DB, date, { search:search||undefined, sortBy:absSortBy, sortDir:absSortDir }),
    listMembers(DB,{ activeOnly:true, excludeSuperAdmins:true }),
    listLocations(DB, true),
    listSevaRoles(DB, true),
  ]);

  const members = allMembers.filter(m => !m.is_super_admin);
  const allSessions = Array.from(new Set(presentData.records.map(r=>r.session_label).filter(Boolean)));

  return json({ presentRecords:presentData.records, presentTotal:presentData.total, absentList, date, toDate, isRange, page, totalPages:Math.ceil(presentData.total/PAGE), tab, search, filterRole, filterLoc, filterSess, sortBy, sortDir, absSortBy, absSortDir, members, locations, sevaRoles, allSessions, canViewAttendance:    can(perms,"view_attendance")      ||session.isSuperAdmin,
    canMarkAttendance:    can(perms,"mark_attendance")      ||session.isSuperAdmin,
    canBulkMark:          can(perms,"bulk_mark_attendance") ||session.isSuperAdmin,
    canEditAttendance:    can(perms,"edit_attendance")      ||session.isSuperAdmin,
    canDeleteAttendance:  can(perms,"delete_attendance")    ||session.isSuperAdmin });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const form    = await request.formData();
  const intent  = form.get("intent") as string;
  const today   = todayISO();
  const perms   = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  const ip      = getClientIp(request);

  if (intent==="mark-admin") {
    if (!can(perms,"mark_attendance")) return json({markError:"You do not have permission to mark attendance."});
    const memberId   = form.get("memberId")   as string;
    const date       = form.get("date")       as string;
    const sevaRole   = (form.get("sevaRole") as string)||null;
    const locationId = parseInt(form.get("locationId") as string);
    if (!session.isSuperAdmin&&date!==today) return json({markError:"Normal admin: today only."});
    const [locs,member] = await Promise.all([listLocations(DB,true),getMemberById(DB,memberId)]);
    const loc = locs.find(l=>l.id===locationId);
    if (!loc||!member) return json({markError:"Location or member not found."});
    await markAttendance(DB,{memberId:member.id,memberName:member.name,sevaRole,locationId:loc.id,locationName:loc.name,date,lat:loc.lat,lng:loc.lng,accuracy:0,distanceMeters:0,scheduleId:0,markedById:session.memberId,markedByName:session.memberName});
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"attendance_marked", targetType:"member", targetId:memberId, details:{date,location:loc.name,sevaRole,markedBy:session.memberName}, ip });
    return json({markSuccess:`Marked: ${member.name}.`});
  }

  if (intent==="bulk-mark") {
    if (!can(perms,"bulk_mark_attendance")) return json({markError:"You do not have permission to bulk-mark attendance."});
    const date       = form.get("date")       as string;
    const locationId = parseInt(form.get("locationId") as string);
    if (!session.isSuperAdmin&&date!==today) return json({markError:"Normal admin: today only."});
    const locs = await listLocations(DB,true);
    const loc  = locs.find(l=>l.id===locationId);
    if (!loc) return json({markError:"Location not found."});
    let memberIds:string[]=[]; let sevaRoles:Record<string,string>={};
    try{memberIds=JSON.parse(form.get("memberIds") as string);}catch{}
    try{sevaRoles=JSON.parse(form.get("sevaRoles") as string);}catch{}
    if (!memberIds.length) return json({markError:"No members selected."});
    let count=0;
    for (const mid of memberIds) {
      const member = await getMemberById(DB,mid);
      if (!member) continue;
      await markAttendance(DB,{memberId:member.id,memberName:member.name,sevaRole:sevaRoles[mid]||null,locationId:loc.id,locationName:loc.name,date,lat:loc.lat,lng:loc.lng,accuracy:0,distanceMeters:0,scheduleId:0,markedById:session.memberId,markedByName:session.memberName});
      count++;
    }
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"bulk_attendance_marked", details:{date,location:loc.name,count,markedBy:session.memberName}, ip });
    return json({markSuccess:`Marked ${count} members present.`});
  }

  if (intent==="edit-attendance") {
    if (!can(perms,"edit_attendance")) return json({markError:"You do not have permission to edit attendance."});
    const id   = parseInt(form.get("attendanceId") as string);
    const date = form.get("date") as string;
    if (!session.isSuperAdmin&&date!==today) return json({markError:"Normal admin: today only."});
    await updateAttendance(DB,id,{seva_role:(form.get("sevaRole") as string)||undefined});
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"attendance_edited", targetType:"attendance", targetId:String(id), details:{date}, ip });
    return json({markSuccess:"Record updated."});
  }

  if (intent==="delete-attendance") {
    if (!can(perms,"delete_attendance")) return json({markError:"You do not have permission to delete attendance."});
    const id   = parseInt(form.get("attendanceId") as string);
    const date = form.get("date") as string;
    if (!session.isSuperAdmin&&date!==today) return json({markError:"Normal admin: today only."});
    await deleteAttendance(DB,id);
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"attendance_deleted", targetType:"attendance", targetId:String(id), details:{date}, ip });
    return json({markSuccess:"Record deleted."});
  }

  return json({markError:"Unknown action."});
}


function ExportButton({exportBase, isRange}:{exportBase:URLSearchParams;isRange:boolean}) {
  const [fmt,setFmt] = useState<"csv"|"pdf">("csv");
  const href = `/api/export?${exportBase.toString()}&format=${fmt}`;
  return (
    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:"var(--gray-600)"}}>
        <label style={{display:"flex",alignItems:"center",gap:"3px",cursor:"pointer"}}>
          <input type="radio" name="exportFmt" value="csv" checked={fmt==="csv"} onChange={()=>setFmt("csv")} style={{accentColor:"var(--primary)"}}/>
          Excel
        </label>
        <label style={{display:"flex",alignItems:"center",gap:"3px",cursor:"pointer"}}>
          <input type="radio" name="exportFmt" value="pdf" checked={fmt==="pdf"} onChange={()=>setFmt("pdf")} style={{accentColor:"var(--primary)"}}/>
          PDF
        </label>
      </div>
      <a href={href} className="btn btn-secondary btn-md">📥 {isRange ? "Export Range" : "Export This Day"}</a>
    </div>
  );
}

function SortTh({col,label,sortBy,sortDir,onSort}:{col:string;label:string;sortBy:string;sortDir:string;onSort:(c:string)=>void}) {
  return <th style={{cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}} onClick={()=>onSort(col)} title={`Sort by ${label}`}>{label} {sortBy===col?(sortDir==="asc"?"↑":"↓"):<span style={{opacity:.25}}>↕</span>}</th>;
}

export default function AdminAttendancePage() {
  const { presentRecords, presentTotal, absentList, date, toDate, isRange, page, totalPages, tab, search, filterRole, filterLoc, filterSess, sortBy, sortDir, absSortBy, absSortDir, members, locations, sevaRoles, allSessions, canViewAttendance, canMarkAttendance, canBulkMark, canEditAttendance, canDeleteAttendance } = useLoaderData<typeof loader>();
  const { isSuperAdmin, adminId, adminName } = useAdminLayout();
  const ad = useActionData<typeof action>() as any;
  const [sp,setSp] = useSearchParams();
  const [showMark,setShowMark]     = useState(false);
  const [showBulk,setShowBulk]     = useState(false);
  const [editRec,setEditRec]       = useState<typeof presentRecords[0]|null>(null);
  const [bulkSel,setBulkSel]       = useState<Set<string>>(new Set());
  const [bulkRoles,setBulkRoles]   = useState<Record<string,string>>({});
  const [bulkLoc,setBulkLoc]       = useState(locations[0]?.id?.toString()??"");
  const [bulkDate,setBulkDate]     = useState(date);
  const { confirm, ConfirmDialog } = useConfirm();
  const today = todayISO();

  // Local date state — only committed to URL on Search button click
  const [localDate, setLocalDate]     = useState(date);
  const [localToDate, setLocalToDate] = useState(toDate);

  const set=(k:string,v:string)=>{const n=new URLSearchParams(sp);n.set(k,v);n.set("page","1");setSp(n);};
  const sortPresent=(col:string)=>{const n=new URLSearchParams(sp);const cur=sp.get("sortBy")||"marked_at";n.set("sortBy",col);n.set("sortDir",cur===col&&(sp.get("sortDir")||"desc")==="asc"?"desc":"asc");setSp(n);};
  const sortAbsent=(col:string)=>{const n=new URLSearchParams(sp);const cur=sp.get("absSortBy")||"name";n.set("absSortBy",col);n.set("absSortDir",cur===col&&(sp.get("absSortDir")||"asc")==="asc"?"desc":"asc");setSp(n);};

  // Apply buffered date range to URL params
  const applyDateRange = () => {
    const n = new URLSearchParams(sp);
    n.set("date", localDate);
    n.set("toDate", localToDate < localDate ? localDate : localToDate);
    n.set("page", "1");
    setSp(n);
  };

  const clearRange = () => {
    setLocalToDate(localDate);
    const n = new URLSearchParams(sp);
    n.set("date", localDate);
    n.set("toDate", localDate);
    n.set("page", "1");
    setSp(n);
  };

  const displayed = filterSess ? presentRecords.filter(r=>(r.session_label??"")===filterSess) : presentRecords;
  const exportBase = new URLSearchParams({ from:date, to:toDate });
  if (search) exportBase.set("search",search);
  if (filterRole) exportBase.set("role",filterRole);
  if (filterLoc)  exportBase.set("loc",filterLoc);


  return (
    <>
      <div className="admin-topbar" style={{flexWrap:"wrap",gap:"8px",minHeight:"auto",padding:"10px 24px"}}>
        {canViewAttendance ? ( <div> <h1 className="admin-topbar__title">Attendance  — {isRange ? `${fmtDate(date)} to ${fmtDate(toDate)}` : fmtDate(date)}  </h1> </div> )
        : ( <h1 className="admin-topbar__title">Attendance </h1> )}
        {canViewAttendance && ( <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <label style={{fontSize:"11px",color:"var(--gray-500)",fontWeight:600}}>From</label>
            <input
              type="date"
              value={localDate}
              max={isSuperAdmin?undefined:today}
              className="form-input"
              style={{width:"auto"}}
              onChange={e => setLocalDate(e.target.value)}
              title="Start date"
            />
            <label style={{fontSize:"11px",color:"var(--gray-500)",fontWeight:600}}>To</label>
            <input
              type="date"
              value={localToDate}
              min={localDate}
              max={isSuperAdmin?undefined:today}
              className="form-input"
              style={{width:"auto"}}
              onChange={e => setLocalToDate(e.target.value)}
              title="End date (leave same as From for single day)"
            />
            {/* Search button — prevents firing request on every date keystroke */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={applyDateRange}
              title="Load attendance for selected date range"
            >
              🔍 Search
            </button>
            {isRange && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearRange}
                title="Clear range — revert to single day"
              >
                ✕
              </button>
            )}
          </div>
          {canBulkMark&&<button className="btn btn-secondary btn-md" onClick={()=>setShowBulk(true)} title="Mark multiple members present from a list">📋 Mark List</button>}
          {canMarkAttendance&&<button className="btn btn-primary btn-md" onClick={()=>setShowMark(true)} title="Mark a single member present">✅ Mark Single</button>}
        </div> )}
      </div>

      <div className="admin-content">
        {!canViewAttendance && <div className="alert alert-error" style={{marginBottom:"16px"}}>⚠️ You do not have permission to view attendance.</div>}
        {ad?.markSuccess&&<div className="alert alert-success" style={{marginBottom:"16px"}}>✅ {ad.markSuccess}</div>}
        {ad?.markError  &&<div className="alert alert-error"   style={{marginBottom:"16px"}}>⚠️ {ad.markError}</div>}

        {isRange && canViewAttendance &&(
          <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:"var(--radius-sm)",padding:"8px 12px",marginBottom:"12px",fontSize:"12px",color:"#c2410c"}}>
            📅 Range: <strong>{fmtDate(date)}</strong> → <strong>{fmtDate(toDate)}</strong> &nbsp;·&nbsp; {presentTotal} records total. Absent tab hidden in range view.
          </div>
        )}
        
        {/* Tabs */}
        {canViewAttendance && (
        <div style={{display:"flex",borderBottom:"2px solid var(--gray-100)",marginBottom:"20px"}}>
          {[{key:"present",label:`Present (${presentTotal})`},...(!isRange?[{key:"absent",label:`Absent (${absentList.length})`}]:[])].map(t=>(
            <button key={t.key} type="button" onClick={()=>set("tab",t.key)}
              style={{padding:"10px 20px",border:"none",cursor:"pointer",fontFamily:"var(--font-body)",fontSize:"14px",fontWeight:tab===t.key?"700":"400",borderBottom:tab===t.key?"2px solid var(--primary)":"2px solid transparent",marginBottom:"-2px",background:"none",color:tab===t.key?"var(--primary)":"var(--gray-500)"}}>
              {t.label}
            </button>
          ))}
        </div> )}

        {/* Filters */}
          {canViewAttendance && <div className="toolbar" style={{marginBottom:"16px"}}>
          <input type="text" className="form-input" placeholder="Search name / ID…" style={{maxWidth:"200px"}} defaultValue={search} onChange={e=>set("search",e.target.value)} title="Search by member name or ID"/>
          {tab==="present"&&<>
            <select className="form-select" style={{width:"auto"}} value={filterRole} onChange={e=>set("role",e.target.value)} title="Filter by seva role">
              <option value="">All Roles</option>{sevaRoles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
            <select className="form-select" style={{width:"auto"}} value={filterLoc} onChange={e=>set("loc",e.target.value)} title="Filter by location">
              <option value="">All Locations</option>{locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            <select className="form-select" style={{width:"auto"}} value={filterSess} onChange={e=>set("sess",e.target.value)} title="Filter by session">
              <option value="">All Sessions</option>
              {allSessions.map(s=><option key={s!} value={s!}>{s}</option>)}
            </select>
          </>}
          <ExportButton exportBase={exportBase} isRange={isRange} />
        </div>}

        {/* Present tab */}
        {tab==="present"&& canViewAttendance && (
          <div className="card">
            <div className="table-wrap"><table>
              <thead><tr>
                <th>#</th>
                {isRange && <th style={{whiteSpace:"nowrap",fontSize:"11px"}}>Date</th>}
                <SortTh col="member_name"  label="Name"       sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <SortTh col="member_id"    label="ID"         sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <SortTh col="seva_role"    label="Seva Role"  sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <SortTh col="session_label" label="Session"   sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <SortTh col="location_name" label="Location"  sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <SortTh col="marked_at"    label="Time (IST)" sortBy={sortBy} sortDir={sortDir} onSort={sortPresent}/>
                <th title="Distance from geofence centre when marking">Dist</th>
                <th title="Who marked this attendance record">Marked By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {displayed.length===0&&<tr><td colSpan={10} style={{textAlign:"center",color:"var(--gray-400)",padding:"40px"}}>No records.</td></tr>}
                {displayed.map((r,i)=>(
                  <tr key={r.id}>
                    <td style={{color:"var(--gray-400)",fontSize:"12px"}}>{(page-1)*PAGE+i+1}</td>
                    {isRange && <td style={{fontSize:"11px",color:"var(--gray-500)",whiteSpace:"nowrap"}}>{fmtDate(r.date)}</td>}
                    <td style={{fontWeight:"600"}}>{r.member_name??"—"}</td>
                    <td><code style={{fontSize:"12px",background:"var(--gray-100)",padding:"2px 6px",borderRadius:"4px"}}>{r.member_id}</code></td>
                    <td>{r.seva_role??"—"}</td>
                    <td style={{fontSize:"12px"}}>{r.session_label??"—"}{r.satsang_type?` · ${r.satsang_type}`:""}</td>
                    <td>{r.location_name??"—"}</td>
                    <td>{fmtTime(r.marked_at)}</td>
                    <td>{r.distance_meters!=null?<span className="badge badge-success" title={`${r.distance_meters}m from location centre`}>{r.distance_meters}m</span>:<span className="badge badge-gray" title="Marked by admin — no GPS">Admin</span>}</td>
                    <td style={{fontSize:"12px",color:"var(--gray-500)"}} title={r.marked_by_id?`Admin: ${r.marked_by_name} (${r.marked_by_id})`:"Member marked their own attendance"}>{r.marked_by_id?`${r.marked_by_name} (${r.marked_by_id})`:"Self"}</td>
                    <td>
                      <div style={{display:"flex",gap:"4px"}}>
                        {canEditAttendance&&<button type="button" className="btn btn-sm btn-secondary" onClick={()=>setEditRec(r)} title="Edit seva role for this record">✏️</button>}
                        {canDeleteAttendance&&<Form method="post" onSubmit={async e=>{e.preventDefault();if(await confirm("Delete this attendance record?",{danger:true,title:"Delete Record",confirmLabel:"Delete"}))(e.target as HTMLFormElement).submit();}}>
                          <input type="hidden" name="intent" value="delete-attendance"/>
                          <input type="hidden" name="attendanceId" value={r.id}/>
                          <input type="hidden" name="date" value={r.date}/>
                          <button type="submit" className="btn btn-sm btn-danger" title="Delete this attendance record permanently">🗑</button>
                        </Form>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {totalPages>1&&<div className="pagination">
              <button className="page-btn" disabled={page<=1} onClick={()=>set("page",String(page-1))}>‹</button>
              {Array.from({length:Math.min(totalPages,7)},(_,i)=>i+1).map(p=><button key={p} className={`page-btn${p===page?" active":""}`} onClick={()=>set("page",String(p))}>{p}</button>)}
              <button className="page-btn" disabled={page>=totalPages} onClick={()=>set("page",String(page+1))}>›</button>
            </div>}
          </div>
        )}

        {/* Absent tab */}
        {tab==="absent"&& canViewAttendance && (
          <div className="card"><div className="table-wrap"><table>
            <thead><tr>
              <th>#</th>
              <SortTh col="name" label="Name" sortBy={absSortBy} sortDir={absSortDir} onSort={sortAbsent}/>
              <SortTh col="id"   label="ID"   sortBy={absSortBy} sortDir={absSortDir} onSort={sortAbsent}/>
              <SortTh col="zone" label="Zone" sortBy={absSortBy} sortDir={absSortDir} onSort={sortAbsent}/>
              <th>Phone</th>
            </tr></thead>
            <tbody>
              {absentList.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"var(--gray-400)",padding:"40px"}}>{presentTotal>0?"🎉 All present!":"No data yet."}</td></tr>}
              {absentList.map((m,i)=>(
                <tr key={m.id}>
                  <td style={{color:"var(--gray-400)",fontSize:"12px"}}>{i+1}</td>
                  <td style={{fontWeight:"600"}}>{m.name}</td>
                  <td><code style={{fontSize:"12px",background:"var(--gray-100)",padding:"2px 6px",borderRadius:"4px"}}>{m.id}</code></td>
                  <td style={{color:"var(--gray-500)"}}>{m.zone??"—"}</td>
                  <td style={{color:"var(--gray-500)"}}>{m.phone??"—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        )}
      </div>

      {/* Single Mark Modal */}
      {showMark&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowMark(false);}}>
          <div className="modal-box">
            <div className="modal-header"><h3>Mark Attendance (Single)</h3><button className="modal-close" type="button" onClick={()=>setShowMark(false)} title="Close">✕</button></div>
            <Form method="post" onSubmit={()=>setShowMark(false)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="mark-admin"/>
                <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                  <div className="alert alert-info" style={{fontSize:"12px"}}>
                    ℹ️ Attendance will be recorded as marked by <strong>{adminName} ({adminId})</strong>.
                    {!isSuperAdmin&&" Normal admin can only mark for today."}
                  </div>
                  <div className="form-group"><label className="form-label">Member *</label><select name="memberId" className="form-select" required title="Select the member to mark present"><option value="">— Select member —</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Date *</label><input name="date" type="date" className="form-input" defaultValue={date} max={isSuperAdmin?undefined:today} min={isSuperAdmin?undefined:today} required title={isSuperAdmin?"Super admin: any date":"Normal admin: today only"}/></div>
                  <div className="form-group"><label className="form-label">Location *</label><select name="locationId" className="form-select" required title="Select the satsang location"><option value="">— Select location —</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Seva Role</label><select name="sevaRole" className="form-select" title="Optional — leave blank to save as NA"><option value="">— NA (not set) —</option>{sevaRoles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}</select></div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setShowMark(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-md">Mark Present</button></div>
            </Form>
          </div>
        </div>
      )}

      {/* Bulk Mark List Modal */}
      {showBulk&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowBulk(false);}}>
          <div className="modal-box" style={{maxWidth:"660px",width:"100%"}}>
            <div className="modal-header"><h3>📋 Mark Attendance in List</h3><button className="modal-close" type="button" onClick={()=>setShowBulk(false)}>✕</button></div>
            <Form method="post" onSubmit={()=>{setShowBulk(false);setBulkSel(new Set());}}>
              <div className="modal-body">
                <input type="hidden" name="intent"    value="bulk-mark"/>
                <input type="hidden" name="memberIds" value={JSON.stringify(Array.from(bulkSel))}/>
                <input type="hidden" name="sevaRoles" value={JSON.stringify(bulkRoles)}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input name="date" type="date" className="form-input" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} max={isSuperAdmin?undefined:today} min={isSuperAdmin?undefined:today} required title={isSuperAdmin?"Any date":"Today only"}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location *</label>
                    <select name="locationId" className="form-select" value={bulkLoc} onChange={e=>setBulkLoc(e.target.value)} required>
                      <option value="">— Select —</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{fontSize:"12px",color:"var(--gray-500)",marginBottom:"10px"}}>
                  Tick members who are present. Seva role is optional — leave blank to save as NA.
                </div>
                <div style={{maxHeight:"340px",overflowY:"auto",border:"1px solid var(--gray-100)",borderRadius:"var(--radius-sm)"}}>
                  <table style={{width:"100%"}}>
                    <thead style={{position:"sticky",top:0,background:"var(--gray-50)",zIndex:1}}>
                      <tr>
                        <th style={{width:"40px"}}>
                          <input type="checkbox" title="Select all members"
                            onChange={e=>{if(e.target.checked)setBulkSel(new Set(members.map(m=>m.id)));else setBulkSel(new Set());}}
                            style={{width:"16px",height:"16px"}}/>
                        </th>
                        <th>Name</th><th>ID</th><th>Seva Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m=>(
                        <tr key={m.id} style={{background:bulkSel.has(m.id)?"var(--primary-light)":"white"}}>
                          <td><input type="checkbox" checked={bulkSel.has(m.id)} onChange={e=>{const n=new Set(bulkSel);e.target.checked?n.add(m.id):n.delete(m.id);setBulkSel(n);}} style={{width:"16px",height:"16px",accentColor:"var(--primary)"}} title={`Select ${m.name}`}/></td>
                          <td style={{fontWeight:"500",fontSize:"13px"}}>{m.name}</td>
                          <td style={{fontSize:"12px",color:"var(--gray-400)"}}>{m.id}</td>
                          <td>
                            {bulkSel.has(m.id)?(
                              <select style={{fontSize:"12px",padding:"4px 8px",border:"1px solid var(--gray-200)",borderRadius:"4px",fontFamily:"var(--font-body)",background:"white"}}
                                value={bulkRoles[m.id]||""} onChange={e=>setBulkRoles(p=>({...p,[m.id]:e.target.value}))}
                                title="Seva role for this member (optional)">
                                <option value="">NA</option>
                                {sevaRoles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
                              </select>
                            ):<span style={{fontSize:"12px",color:"var(--gray-300)"}}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{marginTop:"10px",fontSize:"13px",color:"var(--gray-500)"}}>{bulkSel.size} member{bulkSel.size!==1?"s":""} selected</div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setShowBulk(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={bulkSel.size===0} title="Mark all selected members present">Mark {bulkSel.size} Present</button></div>
            </Form>
          </div>
        </div>
      )}

      {/* Edit record modal */}
      {editRec&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setEditRec(null);}}>
          <div className="modal-box">
            <div className="modal-header"><h3>Edit Record — {editRec.member_name}</h3><button className="modal-close" type="button" onClick={()=>setEditRec(null)}>✕</button></div>
            <Form method="post" onSubmit={()=>setEditRec(null)}>
              <div className="modal-body">
                <input type="hidden" name="intent"       value="edit-attendance"/>
                <input type="hidden" name="attendanceId" value={editRec.id}/>
                <input type="hidden" name="date"         value={editRec.date}/>
                <div className="form-group">
                  <label className="form-label">Seva Role</label>
                  <select name="sevaRole" className="form-select" defaultValue={editRec.seva_role??""} title="Update seva role for this record">
                    <option value="">NA</option>
                    {sevaRoles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
                <div style={{marginTop:"12px",fontSize:"12px",color:"var(--gray-400)"}}>
                  Date: {editRec.date} · Time: {fmtTime(editRec.marked_at)} · Location: {editRec.location_name}
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setEditRec(null)}>Cancel</button><button type="submit" className="btn btn-primary btn-md">Save</button></div>
            </Form>
          </div>
        </div>
      )}

      {ConfirmDialog}
      <Toast message={ad?.markError} type="error" />
      <Toast message={ad?.markSuccess} type="success" />
    </>
  );
}
