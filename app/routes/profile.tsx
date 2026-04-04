import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json, redirect, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { requireMember } from "~/lib/session.server";
import { getMemberById, setMemberPin, updateMember } from "~/lib/db.server";
import { generateSalt, hashPin, isWeakPin, verifyPin } from "~/lib/auth.server";
import { uploadProfilePhoto } from "~/lib/r2.server";

export const meta: MetaFunction = () => [{ title: "Profile — Sevadal Attendance" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireMember(request, SESSION_SECRET, DB);
  const member = await getMemberById(DB, session.memberId);
  if (!member) throw redirect("/auth/logout");
  return json({ member });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET, BUCKET } = context.cloudflare.env;
  const session = await requireMember(request, SESSION_SECRET, DB);
  const ct = request.headers.get("content-type")??"";

  if (ct.includes("multipart/form-data")) {
    const handler = unstable_createMemoryUploadHandler({ maxPartSize:3_000_000 });
    const form = await unstable_parseMultipartFormData(request, handler);
    if (form.get("intent")==="photo") {
      const file = form.get("photo") as File|null;
      if (!file||file.size===0) return json({photoError:"No file selected."});
      const result = await uploadProfilePhoto(BUCKET, session.memberId, file);
      if (result.error) return json({photoError:result.error});
      await updateMember(DB, session.memberId, {photo_key:result.key});
      return json({photoSuccess:true});
    }
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent==="edit-profile") {
    await updateMember(DB, session.memberId, {
      phone:(form.get("phone") as string)||undefined,
      dob:(form.get("dob") as string)||undefined,
      gender:(form.get("gender") as string)||undefined,
      zone:(form.get("zone") as string)||undefined,
    });
    return json({profileSuccess:true});
  }

  if (intent==="change-pin") {
    const currentPin=form.get("currentPin") as string;
    const newPin=form.get("newPin") as string;
    const confirmPin=form.get("confirmPin") as string;
    if (!currentPin||!newPin||!confirmPin) return json({pinError:"All PIN fields required."});
    const member=await getMemberById(DB,session.memberId);
    if (!member) throw redirect("/auth/logout");
    if (!member.pin_set||!member.pin_hash||!member.pin_salt) return json({pinError:"No PIN set. Contact admin."});
    if (!await verifyPin(currentPin,member.pin_hash,member.pin_salt)) return json({pinError:"Current PIN incorrect."});
    if (!/^\d{4}$/.test(newPin)) return json({pinError:"PIN must be 4 digits."});
    if (isWeakPin(newPin)) return json({pinError:"PIN too simple."});
    if (newPin!==confirmPin) return json({pinError:"PINs do not match."});
    if (newPin===currentPin) return json({pinError:"New PIN must differ from current."});
    const salt=await generateSalt();
    await setMemberPin(DB,session.memberId,await hashPin(newPin,salt),salt);
    return json({pinSuccess:true});
  }

  return json({error:"Unknown action."});
}

export default function ProfilePage() {
  const { member } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state==="submitting";
  const [editing, setEditing] = useState(false);

  return (
    <div className="member-shell">
      <header className="member-header">
        <div className="member-header__logo">
          <Link to="/dashboard" style={{display:"flex",alignItems:"center",gap:"6px",color:"inherit"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </Link>
          <span className="member-header__title">My Profile</span>
        </div>
      </header>

      <main className="member-content">
        <div className="profile-header">
          <div className="profile-photo-wrap">
            {member.photo_key?<img src={`/api/photo/${encodeURIComponent(member.photo_key)}`} alt={member.name} className="avatar avatar-xl" style={{objectFit:"cover"}}/>:<div className="avatar avatar-xl">{member.name[0]}</div>}
            <label className="profile-photo-edit" htmlFor="photoInput" title="Change photo">✏️</label>
          </div>
          <div className="profile-name">{member.name}</div>
          <div className="profile-id">ID: {member.id}</div>
        </div>

        <Form method="post" encType="multipart/form-data" id="photoForm" style={{display:"none"}}>
          <input type="hidden" name="intent" value="photo"/>
          <input id="photoInput" name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{if(e.target.files?.[0])(document.getElementById("photoForm") as HTMLFormElement)?.requestSubmit();}}/>
        </Form>

        {(actionData as any)?.photoSuccess&&<div className="alert alert-success" style={{margin:"12px 16px 0"}}>✅ Photo updated.</div>}
        {(actionData as any)?.photoError&&<div className="alert alert-error" style={{margin:"12px 16px 0"}}>⚠️ {(actionData as any).photoError}</div>}
        {(actionData as any)?.profileSuccess&&<div className="alert alert-success" style={{margin:"12px 16px 0"}}>✅ Profile updated.</div>}

        {/* Info / Edit */}
        <div style={{padding:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
            <div style={{fontFamily:"var(--font-heading)",fontWeight:"700",fontSize:"15px"}}>My Details</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={()=>setEditing(e=>!e)}>{editing?"Cancel":"✏️ Edit"}</button>
          </div>

          {editing?(
            <Form method="post" style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              <input type="hidden" name="intent" value="edit-profile"/>
              <div className="form-group"><label className="form-label">Phone</label><input name="phone" type="tel" className="form-input" defaultValue={member.phone??""}/></div>
              <div className="form-group"><label className="form-label">Date of Birth</label><input name="dob" type="date" className="form-input" defaultValue={member.dob??""}/></div>
              <div className="form-group"><label className="form-label">Gender</label><select name="gender" className="form-select" defaultValue={member.gender??""}><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></div>
              <div className="form-group"><label className="form-label">Zone</label><input name="zone" type="text" className="form-input" defaultValue={member.zone??""}/></div>
              <button type="submit" className="btn btn-primary btn-md btn-full" disabled={submitting} onClick={()=>setEditing(false)}>{submitting?"Saving…":"Save Changes"}</button>
            </Form>
          ):(
            <div className="profile-info-list">
              {[{label:"Member ID",value:member.id},{label:"Phone",value:member.phone??"—"},{label:"Date of Birth",value:member.dob??"—"},{label:"Gender",value:member.gender??"—"},{label:"Zone",value:member.zone??"—"}].map(({label,value})=>(
                <div key={label} className="profile-info-item">
                  <span className="profile-info-label">{label}</span>
                  <span className="profile-info-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change PIN */}
        <div style={{padding:"16px",borderTop:"1px solid var(--gray-100)"}}>
          <div style={{fontFamily:"var(--font-heading)",fontWeight:"700",fontSize:"15px",marginBottom:"14px"}}>Change PIN</div>
          <Form method="post" style={{display:"flex",flexDirection:"column",gap:"14px"}}>
            <input type="hidden" name="intent" value="change-pin"/>
            <div className="form-group"><label className="form-label">Current PIN</label><input name="currentPin" type="password" className="form-input" inputMode="numeric" maxLength={4} placeholder="Current 4-digit PIN"/></div>
            <div className="form-group"><label className="form-label">New PIN</label><input name="newPin" type="password" className="form-input" inputMode="numeric" maxLength={4} placeholder="New 4-digit PIN"/></div>
            <div className="form-group"><label className="form-label">Confirm New PIN</label><input name="confirmPin" type="password" className="form-input" inputMode="numeric" maxLength={4} placeholder="Re-enter PIN"/></div>
            {(actionData as any)?.pinError&&<div className="alert alert-error"><span>⚠️</span><span>{(actionData as any).pinError}</span></div>}
            {(actionData as any)?.pinSuccess&&<div className="alert alert-success"><span>✅</span><span>PIN updated.</span></div>}
            <button type="submit" className="btn btn-primary btn-md btn-full" disabled={submitting}>{submitting?"Updating…":"Update PIN"}</button>
          </Form>
        </div>

        {/* Logout */}
        <div style={{padding:"16px",borderTop:"1px solid var(--gray-100)"}}>
          <div style={{fontFamily:"var(--font-heading)",fontWeight:"700",fontSize:"15px",marginBottom:"14px"}}>Session</div>
          <Form method="post" action="/auth/logout">
            <button type="submit" className="btn btn-outline btn-md btn-full" style={{color:"var(--error)",borderColor:"var(--error)"}}>Logout</button>
          </Form>
        </div>
        <div style={{height:"16px"}}/>
      </main>

      <nav className="bottom-nav">
        <Link to="/dashboard" className="bottom-nav__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>Attendance</Link>
        <Link to="/news" className="bottom-nav__item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>Notices</Link>
        <Link to="/profile" className="bottom-nav__item active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Profile</Link>
      </nav>
    </div>
  );
}
