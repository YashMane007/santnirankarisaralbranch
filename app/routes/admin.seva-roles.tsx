import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { requireSuperAdmin } from "~/lib/session.server";
import { listSevaRoles, createSevaRole, updateSevaRole, deleteSevaRole } from "~/lib/db.server";
import { useConfirm } from "~/components/ConfirmModal";

export const meta: MetaFunction = () => [{ title: "Seva Roles — Sevadal Admin" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  return json({ roles: await listSevaRoles(DB) });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  await requireSuperAdmin(request, SESSION_SECRET, DB);
  const form   = await request.formData();
  const intent = form.get("intent") as string;
  if (intent==="create") {
    const name=(form.get("name") as string)?.trim();
    if (!name) return json({error:"Name required."});
    try{ await createSevaRole(DB,name); return json({success:`"${name}" added.`}); }
    catch{ return json({error:"That name already exists."}); }
  }
  if (intent==="toggle") {
    const id=parseInt(form.get("id") as string);
    const cur=form.get("current")==="1";
    await updateSevaRole(DB,id,{is_active:cur?0:1});
    return json({success:`Role ${cur?"disabled":"enabled"}.`});
  }
  if (intent==="delete") {
    const id=parseInt(form.get("id") as string);
    await deleteSevaRole(DB,id);
    return json({success:"Role deleted."});
  }
  return json({error:"Unknown action."});
}

export default function SevaRolesPage() {
  const { roles }  = useLoaderData<typeof loader>();
  const ad         = useActionData<typeof action>() as any;
  const nav        = useNavigation();
  const submitting = nav.state==="submitting";
  const { confirm, ConfirmDialog } = useConfirm();

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">⚡ Seva Roles</h1>
      </div>
      <div className="admin-content">
        {ad?.success&&<div className="alert alert-success" style={{marginBottom:"16px"}}>✅ {ad.success}</div>}
        {ad?.error  &&<div className="alert alert-error"   style={{marginBottom:"16px"}}>⚠️ {ad.error}</div>}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:"20px"}}>
          <div className="card">
            <div className="card-header"><h3>Add Seva Role</h3></div>
            <div className="card-body">
              <Form method="post" style={{display:"flex",gap:"10px"}}>
                <input type="hidden" name="intent" value="create"/>
                <input name="name" type="text" className="form-input" placeholder="e.g. Transport" style={{flex:1}} required title="Name of the new seva role"/>
                <button type="submit" className="btn btn-primary btn-md" disabled={submitting}>Add</button>
              </Form>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>All Roles ({roles.length})</h3></div>
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {roles.map(r=>(
                  <tr key={r.id}>
                    <td style={{fontWeight:"500"}}>{r.name}</td>
                    <td><span className={`badge ${r.is_active?"badge-success":"badge-gray"}`}>{r.is_active?"Active":"Disabled"}</span></td>
                    <td style={{display:"flex",gap:"6px"}}>
                      <Form method="post">
                        <input type="hidden" name="intent"  value="toggle"/>
                        <input type="hidden" name="id"      value={r.id}/>
                        <input type="hidden" name="current" value={r.is_active?"1":"0"}/>
                        <button type="submit" className={`btn btn-sm ${r.is_active?"btn-secondary":"btn-outline"}`} title={r.is_active?"Disable — members won't see this role":"Enable — members will see this role"}>{r.is_active?"Disable":"Enable"}</button>
                      </Form>
                      <Form method="post" onSubmit={async e=>{ e.preventDefault(); if (await confirm(`Delete "${r.name}"? This cannot be undone.`,{danger:true,title:"Delete Seva Role",confirmLabel:"Delete"})) (e.target as HTMLFormElement).submit(); }}>
                        <input type="hidden" name="intent" value="delete"/>
                        <input type="hidden" name="id"     value={r.id}/>
                        <button type="submit" className="btn btn-sm btn-danger" title="Permanently delete this seva role">🗑</button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="card" style={{maxWidth:"500px",marginTop:"20px"}}>
          <div className="card-body">
            <div style={{fontWeight:"700",marginBottom:"8px"}}>ℹ️ About Seva Roles</div>
            <ul style={{fontSize:"13px",color:"var(--gray-500)",paddingLeft:"18px",lineHeight:"1.9"}}>
              <li>Active roles appear in the dropdown when members mark attendance.</li>
              <li>Members select their role fresh each time — it is not saved to their profile.</li>
              <li>Members can also type a custom role using the "Other" option.</li>
              <li>Disabling a role hides it from new records — old records keep their value.</li>
              <li>Deleting permanently removes the role. Existing attendance records are unaffected.</li>
            </ul>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </>
  );
}
