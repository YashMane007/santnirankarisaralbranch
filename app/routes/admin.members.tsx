import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { useConfirm } from "~/components/ConfirmModal";
import { Toast } from "~/components/Toast";
import { useAdminLayout } from "~/routes/admin";
import { createMember, listMembers, memberIdExists, resetMemberPin, updateMember, deleteMember, bulkCreateMembers, getMemberRoleCounts } from "~/lib/db.server";
import { requireAdmin } from "~/lib/session.server";
import { getAdminPermissions, can } from "~/lib/permissions.server";
import { logAudit, getClientIp } from "~/lib/audit.server";

export const meta: MetaFunction = () => [{ title: "Members — Sevadal Admin" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  const url = new URL(request.url);
  const search   = url.searchParams.get("q")       ?? "";
  const sortBy   = url.searchParams.get("sortBy")  ?? "name";
  const sortDir  = (url.searchParams.get("sortDir") ?? "asc") as "asc"|"desc";
  // Non-SA admin cannot see SA members
  const [members, roleCounts] = await Promise.all([
    listMembers(DB, { search, sortBy, sortDir, excludeSuperAdmins: !session.isSuperAdmin }),
    getMemberRoleCounts(DB),
  ]);
  return json({
    members,
    roleCounts,
    search, sortBy, sortDir,
    canViewMembers:    can(perms,"view_members")         || session.isSuperAdmin,
    canAddMembers:     can(perms,"add_members")          || session.isSuperAdmin,
    canEditMembers:    can(perms,"edit_members")         || session.isSuperAdmin,
    canDeleteMembers:  can(perms,"delete_members")       || session.isSuperAdmin,
    canToggleActive:   can(perms,"toggle_member_active") || session.isSuperAdmin,
    canPromoteAdmin:   can(perms,"promote_admin")        || session.isSuperAdmin,
    isSuperAdmin: session.isSuperAdmin,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const { requireAdmin } = await import("~/lib/session.server");
  const session = await requireAdmin(request, SESSION_SECRET, DB);
  const ct = request.headers.get("content-type")??"";

  if (ct.includes("multipart/form-data")) {
    const handler = unstable_createMemoryUploadHandler({ maxPartSize:5_000_000 });
    const form = await unstable_parseMultipartFormData(request, handler);
    if (form.get("intent")==="bulk-import") {
      const file = form.get("csvFile") as File|null;
      if (!file||file.size===0) return json({ bulkError:"No file." });
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l=>l.trim());
      if (lines.length<2) return json({ bulkError:"Need header + data rows." });
      const header = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/[^a-z_]/g,""));
      const idIdx   = header.findIndex(h=>["id","memberid","member_id"].includes(h));
      const nameIdx = header.findIndex(h=>["name","fullname","full_name"].includes(h));
      const phoneIdx= header.findIndex(h=>h.includes("phone")||h.includes("mobile"));
      const dobIdx  = header.findIndex(h=>h.includes("dob")||h.includes("birth"));
      const genderIdx=header.findIndex(h=>h.includes("gender"));
      const zoneIdx = header.findIndex(h=>h.includes("zone"));
      if (idIdx===-1||nameIdx===-1) return json({ bulkError:'CSV needs "id" and "name" columns.' });
      const rows = lines.slice(1).map(line=>{
        const c=line.split(",").map(x=>x.trim().replace(/^"|"$/g,""));
        return { id:c[idIdx]??"", name:c[nameIdx]??"", phone:phoneIdx>=0?c[phoneIdx]:undefined, dob:dobIdx>=0?c[dobIdx]:undefined, gender:genderIdx>=0?c[genderIdx]:undefined, zone:zoneIdx>=0?c[zoneIdx]:undefined };
      }).filter(r=>r.id||r.name);
      const result = await bulkCreateMembers(DB, rows);
      return json({ bulkResult: result });
    }
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;
  const perms = await getAdminPermissions(DB, session.memberId, session.isSuperAdmin);
  const ip = getClientIp(request);

  if (intent==="create") {
    if (!can(perms,"add_members")) return json({ createError:"You do not have permission to add members." });
    const id=(form.get("id") as string)?.trim().toUpperCase();
    const name=(form.get("name") as string)?.trim();
    if (!id||!name) return json({ createError:"ID and Name required." });
    if (!/^[A-Z0-9\-_]+$/.test(id)) return json({ createError:"ID: letters, numbers, - _ only." });
    if (await memberIdExists(DB,id)) return json({ createError:`ID "${id}" already exists.` });
    await createMember(DB,{ id, name, phone:(form.get("phone") as string)||undefined, dob:(form.get("dob") as string)||undefined, gender:(form.get("gender") as string)||undefined, zone:(form.get("zone") as string)||undefined, is_admin:form.get("is_admin")==="1", is_super_admin:session.isSuperAdmin&&form.get("is_super_admin")==="1" });
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"member_created", targetType:"member", targetId:id, details:{name}, ip });
    return json({ createSuccess:true, createdId:id });
  }
  if (intent==="edit") {
    if (!can(perms,"edit_members")) return json({ actionError:"You do not have permission to edit members." });
    const memberId=form.get("memberId") as string;
    await updateMember(DB,memberId,{ name:(form.get("name") as string)||undefined, phone:(form.get("phone") as string)||undefined, dob:(form.get("dob") as string)||undefined, gender:(form.get("gender") as string)||undefined, zone:(form.get("zone") as string)||undefined });
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"member_updated", targetType:"member", targetId:memberId, ip });
    return json({ actionSuccess:"Member updated." });
  }
  if (intent==="delete") {
    if (!can(perms,"delete_members") && !session.isSuperAdmin) return json({ actionError:"You do not have permission to delete members." });
    const memberId=form.get("memberId") as string;
    if (memberId===session.memberId) return json({ actionError:"Cannot delete yourself." });
    await deleteMember(DB,memberId);
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:"super_admin", action:"member_deleted", targetType:"member", targetId:memberId, ip });
    return json({ actionSuccess:"Member deleted." });
  }
  if (intent==="toggle-active") {
    if (!can(perms,"toggle_member_active") && !session.isSuperAdmin) return json({ actionError:"You do not have permission to activate/deactivate members." });
    const memberId=form.get("memberId") as string;
    const cur=form.get("currentActive")==="1";
    if (memberId===session.memberId) return json({ actionError:"Cannot deactivate yourself." });
    await updateMember(DB,memberId,{is_active:cur?0:1});
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:cur?"member_deactivated":"member_activated", targetType:"member", targetId:memberId, ip });
    return json({ actionSuccess:`Member ${cur?"deactivated":"activated"}.` });
  }
  if (intent==="reset-pin") {
    if (!can(perms,"edit_members")) return json({ actionError:"You do not have permission to reset PINs." });
    await resetMemberPin(DB,form.get("memberId") as string);
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:"pin_reset", targetType:"member", targetId:form.get("memberId") as string, ip });
    return json({ actionSuccess:"PIN reset. Member sets new PIN on next login." });
  }
  if (intent==="toggle-admin") {
    if (!can(perms,"promote_admin") && !session.isSuperAdmin) return json({ actionError:"You do not have permission to promote/demote admins." });
    const memberId=form.get("memberId") as string;
    const cur=form.get("currentAdmin")==="1";
    if (memberId===session.memberId) return json({ actionError:"Cannot change your own admin status." });
    await updateMember(DB,memberId,{is_admin:cur?0:1});
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:session.isSuperAdmin?"super_admin":"admin", action:cur?"admin_demoted":"admin_promoted", targetType:"member", targetId:memberId, ip });
    return json({ actionSuccess:`Admin status ${cur?"removed":"granted"}.` });
  }
  if (intent==="toggle-super-admin") {
    if (!session.isSuperAdmin) return json({ actionError:"Only super admins can do this." });
    const memberId=form.get("memberId") as string;
    const cur=form.get("currentSA")==="1";
    if (memberId===session.memberId) return json({ actionError:"Cannot change your own SA status." });
    await updateMember(DB,memberId,{is_super_admin:cur?0:1,is_admin:cur?0:1});
    await logAudit(DB,{ actorId:session.memberId, actorName:session.memberName, actorRole:"super_admin", action:cur?"sa_removed":"sa_granted", targetType:"member", targetId:memberId, ip });
    return json({ actionSuccess:`Super admin ${cur?"removed":"granted"}.` });
  }
  return json({ actionError:"Unknown action." });
}

function SortTh({col,label,sortBy,sortDir,onSort}:{col:string;label:string;sortBy:string;sortDir:string;onSort:(c:string)=>void}) {
  const active=sortBy===col;
  return <th style={{cursor:"pointer",userSelect:"none"}} onClick={()=>onSort(col)} title={`Sort by ${label}`}>{label} {active?(sortDir==="asc"?"↑":"↓"):<span style={{opacity:.25}}>↕</span>}</th>;
}

export default function AdminMembersPage() {
  const { members, roleCounts, search, sortBy, sortDir, canViewMembers, canAddMembers, canEditMembers, canDeleteMembers, canToggleActive, canPromoteAdmin, isSuperAdmin: loaderIsSA } = useLoaderData<typeof loader>();
  const { isSuperAdmin } = useAdminLayout();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state==="submitting";
  const [,setSearchParams] = useSearchParams();
  const { confirm, ConfirmDialog } = useConfirm();
  const [showCreate,setShowCreate]=useState(false);
  const [showBulk,setShowBulk]=useState(false);
  const [editMember,setEditMember]=useState<typeof members[0]|null>(null);
  const [filterZone,setFilterZone]=useState("");
  const [filterRole,setFilterRole]=useState("all");

  const zones=Array.from(new Set(members.map(m=>m.zone).filter(Boolean)));
  const filtered=members.filter(m=>{
    if (filterZone&&m.zone!==filterZone) return false;
    if (filterRole==="super"&&!m.is_super_admin) return false;
    if (filterRole==="admin"&&!m.is_admin&&!m.is_super_admin) return false;
    if (filterRole==="member"&&(m.is_admin||m.is_super_admin)) return false;
    return true;
  });

  const updateSort=(col:string)=>{
    setSearchParams(p=>{const n=new URLSearchParams(p);n.set("sortBy",col);n.set("sortDir",sortBy===col&&sortDir==="asc"?"desc":"asc");return n;});
  };

  const ad = actionData as any;

  return (
    <>
      <div className="admin-topbar">
        {canViewMembers ? (
          <div>
            <h1 className="admin-topbar__title" style={{fontSize:"16px"}}>
              Members ({roleCounts.members.active}/{roleCounts.members.total})
              &nbsp;|&nbsp;Admin ({roleCounts.admins.active}/{roleCounts.admins.total})
              {isSuperAdmin && <span>&nbsp;|&nbsp;Super Admin ({roleCounts.superAdmins.active}/{roleCounts.superAdmins.total})</span>}
            </h1>
          </div>
        )
        : ( <div><h1 className="admin-topbar__title">Members</h1></div> )}
        <div style={{display:"flex",gap:"8px"}}>
          {canAddMembers&&<button className="btn btn-secondary btn-md" type="button" onClick={()=>setShowBulk(true)} title="Import multiple members from a CSV file">📤 Bulk Import</button>}
          {canAddMembers&&<button className="btn btn-primary btn-md"   type="button" onClick={()=>setShowCreate(true)} title="Add a single new member">+ Add Member</button>}
        </div>
      </div>

      <div className="admin-content">
        {ad?.createSuccess&&<div className="alert alert-success" style={{marginBottom:"16px"}}>✅ Member <strong>{ad.createdId}</strong> created. Share this ID via WhatsApp or printed card.</div>}
        {ad?.actionSuccess&&<div className="alert alert-success" style={{marginBottom:"16px"}}>✅ {ad.actionSuccess}</div>}
        {ad?.actionError&&<div className="alert alert-error" style={{marginBottom:"16px"}}>⚠️ {ad.actionError}</div>}
        {ad?.createError&&<div className="alert alert-error" style={{marginBottom:"16px"}}>⚠️ {ad.createError}</div>}
        {ad?.bulkResult&&(
          <div className={`alert ${ad.bulkResult.errors.length?"alert-warning":"alert-success"}`} style={{marginBottom:"16px",flexDirection:"column",alignItems:"flex-start",gap:"6px"}}>
            <div>✅ Imported: <strong>{ad.bulkResult.success.length}</strong> members</div>
            {ad.bulkResult.errors.map((e:any)=><div key={e.row} style={{fontSize:"12px"}}>Row {e.row} ({e.id}): {e.reason}</div>)}
          </div>
        )}

        {!canViewMembers ? (
          <div className="alert alert-error">⚠️ You do not have permission to view members.</div>
        ) : (
        <>
        <div className="toolbar">
          <Form method="get" style={{flex:1,maxWidth:"280px"}}>
            <div className="search-bar">
              <span className="search-bar__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input name="q" type="search" className="form-input" placeholder="Search name / ID…" defaultValue={search} style={{paddingLeft:"36px"}} title="Search by name, ID or zone"/>
            </div>
          </Form>
          <select className="form-select" style={{width:"auto"}} value={filterRole} onChange={e=>setFilterRole(e.target.value)} title="Filter by role">
            <option value="all">All Roles</option>
            {isSuperAdmin&&<option value="super">Super Admin</option>}
            <option value="admin">Admin</option>
            <option value="member">Member Only</option>
          </select>
          {zones.length>0&&<select className="form-select" style={{width:"auto"}} value={filterZone} onChange={e=>setFilterZone(e.target.value)} title="Filter by zone"><option value="">All Zones</option>{zones.map(z=><option key={z!} value={z!}>{z}</option>)}</select>}
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <SortTh col="name" label="Name" sortBy={sortBy} sortDir={sortDir} onSort={updateSort}/>
                <SortTh col="id"   label="ID"   sortBy={sortBy} sortDir={sortDir} onSort={updateSort}/>
                <SortTh col="zone" label="Zone" sortBy={sortBy} sortDir={sortDir} onSort={updateSort}/>
                <th>Phone</th><th>Status</th><th>Role</th><th>PIN</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.length===0&&<tr><td colSpan={8} style={{textAlign:"center",color:"var(--gray-400)",padding:"40px"}}>No members found.</td></tr>}
                {filtered.map(m=>(
                  <tr key={m.id}>
                    <td style={{fontWeight:"600"}}>{m.name}</td>
                    <td><code style={{fontSize:"12px",background:"var(--gray-100)",padding:"2px 6px",borderRadius:"4px"}}>{m.id}</code></td>
                    <td style={{color:"var(--gray-500)",fontSize:"13px"}}>{m.zone??"—"}</td>
                    <td style={{color:"var(--gray-500)",fontSize:"13px"}}>{m.phone??"—"}</td>
                    <td><span className={`badge ${m.is_active?"badge-success":"badge-error"}`}>{m.is_active?"Active":"Inactive"}</span></td>
                    <td>{m.is_super_admin?<span className="badge badge-warning">Super Admin</span>:m.is_admin?<span className="badge badge-primary">Admin</span>:<span className="badge badge-gray">Member</span>}</td>
                    <td><span className={`badge ${m.pin_set?"badge-success":"badge-gray"}`}>{m.pin_set?"Set":"Not Set"}</span></td>
                    <td>
                      <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                        {canEditMembers&&<button type="button" className="btn btn-sm btn-secondary" onClick={()=>setEditMember(m)} title="Edit member details">✏️</button>}
                        {canToggleActive&&<Form method="post" onSubmit={async(e)=>{e.preventDefault();if(await confirm(m.is_active?`Deactivate ${m.name}? They cannot login until reactivated.`:`Activate ${m.name}?`,{danger:m.is_active,title:m.is_active?"Deactivate Member":"Activate Member",confirmLabel:m.is_active?"Deactivate":"Activate"}))(e.target as HTMLFormElement).submit();}}><input type="hidden" name="intent" value="toggle-active"/><input type="hidden" name="memberId" value={m.id}/><input type="hidden" name="currentActive" value={m.is_active?"1":"0"}/><button type="submit" className={`btn btn-sm ${m.is_active?"btn-danger":"btn-secondary"}`} title={m.is_active?"Deactivate — member cannot login":"Activate member"}>{m.is_active?"Deactivate":"Activate"}</button></Form>}
                        {canEditMembers&&<Form method="post" onSubmit={async (e)=>{ e.preventDefault(); if (await confirm(`Reset PIN for ${m.name}? They will set a new PIN on next login.`, {danger:true})) (e.target as HTMLFormElement).submit(); }}><input type="hidden" name="intent" value="reset-pin"/><input type="hidden" name="memberId" value={m.id}/><button type="submit" className="btn btn-sm btn-secondary" title="Reset PIN — member sets new PIN on next login">Reset PIN</button></Form>}
                        {canPromoteAdmin&&!m.is_super_admin&&<Form method="post" onSubmit={async (e)=>{ e.preventDefault(); if (await confirm(m.is_admin?`Remove admin from ${m.name}?`:`Make ${m.name} admin?`, {danger:true})) (e.target as HTMLFormElement).submit(); }}><input type="hidden" name="intent" value="toggle-admin"/><input type="hidden" name="memberId" value={m.id}/><input type="hidden" name="currentAdmin" value={m.is_admin?"1":"0"}/><button type="submit" className="btn btn-sm btn-secondary" title={m.is_admin?"Remove admin privileges":"Grant admin privileges"}>{m.is_admin?"−Admin":"+Admin"}</button></Form>}
                        {isSuperAdmin&&<Form method="post" onSubmit={async (e)=>{ e.preventDefault(); if (await confirm(m.is_super_admin?`Remove Super Admin from ${m.name}?`:`Make ${m.name} SUPER ADMIN?`, {danger:true})) (e.target as HTMLFormElement).submit(); }}><input type="hidden" name="intent" value="toggle-super-admin"/><input type="hidden" name="memberId" value={m.id}/><input type="hidden" name="currentSA" value={m.is_super_admin?"1":"0"}/><button type="submit" className={`btn btn-sm ${m.is_super_admin?"btn-danger":"btn-secondary"}`} title={m.is_super_admin?"Remove super admin":"Grant super admin"}>{m.is_super_admin?"−SA":"+SA"}</button></Form>}
                        {canDeleteMembers&&<Form method="post" onSubmit={async (e)=>{ e.preventDefault(); if (await confirm(`PERMANENTLY DELETE ${m.name}? This cannot be undone.`, {danger:true, title:"Delete Member", confirmLabel:"Delete"})) (e.target as HTMLFormElement).submit(); }}><input type="hidden" name="intent" value="delete"/><input type="hidden" name="memberId" value={m.id}/><button type="submit" className="btn btn-sm btn-danger" title="Permanently delete member and all their records">🗑</button></Form>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Edit Modal */}
      {editMember&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setEditMember(null);}}>
          <div className="modal-box">
            <div className="modal-header"><h3>Edit — {editMember.name}</h3><button className="modal-close" type="button" onClick={()=>setEditMember(null)} title="Close">✕</button></div>
            <Form method="post" onSubmit={()=>setEditMember(null)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="edit"/><input type="hidden" name="memberId" value={editMember.id}/>
                <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                  <div className="form-group"><label className="form-label">Full Name *</label><input name="name" type="text" className="form-input" defaultValue={editMember.name} required/></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div className="form-group"><label className="form-label">Phone</label><input name="phone" type="tel" className="form-input" defaultValue={editMember.phone??""}/></div>
                    <div className="form-group"><label className="form-label">Date of Birth</label><input name="dob" type="date" className="form-input" defaultValue={editMember.dob??""}/></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div className="form-group"><label className="form-label">Gender</label><select name="gender" className="form-select" defaultValue={editMember.gender??""}><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                    <div className="form-group"><label className="form-label">Zone</label><input name="zone" type="text" className="form-input" defaultValue={editMember.zone??""}/></div>
                  </div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setEditMember(null)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting?"Saving…":"Save Changes"}</button></div>
            </Form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}>
          <div className="modal-box">
            <div className="modal-header"><h3>Add New Member</h3><button className="modal-close" type="button" onClick={()=>setShowCreate(false)}>✕</button></div>
            <Form method="post" onSubmit={()=>setShowCreate(false)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="create"/>
                <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div className="form-group"><label className="form-label">Member ID *</label><input name="id" type="text" className="form-input" placeholder="SNM-001" style={{textTransform:"uppercase"}} required/><span className="form-hint">Letters, numbers, - _ only. Shared with member via WhatsApp or card.</span></div>
                    <div className="form-group"><label className="form-label">Full Name *</label><input name="name" type="text" className="form-input" required/></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div className="form-group"><label className="form-label">Phone</label><input name="phone" type="tel" className="form-input"/></div>
                    <div className="form-group"><label className="form-label">Date of Birth</label><input name="dob" type="date" className="form-input"/></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div className="form-group"><label className="form-label">Gender</label><select name="gender" className="form-select"><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                    <div className="form-group"><label className="form-label">Zone</label><input name="zone" type="text" className="form-input"/></div>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer"}} title="Admin can view/manage attendance but is counted in attendance list"><input type="checkbox" name="is_admin" value="1"/><span style={{fontSize:"13px",fontWeight:"500"}}>Grant admin access (counted in attendance)</span></label>
                  {isSuperAdmin&&<label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer"}} title="Super admin can change past data, manage lists, NOT counted in attendance"><input type="checkbox" name="is_super_admin" value="1"/><span style={{fontSize:"13px",fontWeight:"500",color:"var(--saffron-700)"}}>Grant super admin (NOT counted in attendance)</span></label>}
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setShowCreate(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting?"Creating…":"Create Member"}</button></div>
            </Form>
          </div>
        </div>
      )}

      {ConfirmDialog}
      <Toast message={ad?.actionError||ad?.createError} type="error" />
      <Toast message={ad?.actionSuccess||ad?.createSuccess?"✅ Done":undefined} type="success" />
      {/* Bulk Import Modal */}
      {showBulk&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowBulk(false);}}>
          <div className="modal-box">
            <div className="modal-header"><h3>Bulk Import from CSV</h3><button className="modal-close" type="button" onClick={()=>setShowBulk(false)}>✕</button></div>
            <Form method="post" encType="multipart/form-data" onSubmit={()=>setShowBulk(false)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="bulk-import"/>
                <div className="alert alert-info" style={{marginBottom:"14px",fontSize:"12px"}}>
                  <strong>CSV format:</strong> First row must be column headers.<br/>
                  Required: <code>id</code>, <code>name</code> &nbsp;|&nbsp; Optional: <code>phone</code>, <code>dob</code>, <code>gender</code>, <code>zone</code><br/>
                  If an ID already exists → that row is skipped, rest continue.
                </div>
                <div className="form-group"><label className="form-label">CSV File</label><input name="csvFile" type="file" accept=".csv,text/csv" className="form-input" style={{padding:"8px"}} required/></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={()=>setShowBulk(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting?"Importing…":"Import CSV"}</button></div>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
