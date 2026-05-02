import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { requireSuperAdmin } from "~/lib/session.server";
import { listSatsangTypes, createSatsangType, updateSatsangType, deleteSatsangType } from "~/lib/db.server";
import { Toast } from "~/components/Toast";
import { useConfirm } from "~/components/ConfirmModal";

export const meta: MetaFunction = () => [{ title: "Satsang Types — Sevadal Admin" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  return json({ types: await listSatsangTypes(DB) });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  await requireSuperAdmin(request, SESSION_SECRET, DB);
  const form   = await request.formData();
  const intent = form.get("intent") as string;
  if (intent==="create") {
    const name=(form.get("name") as string)?.trim();
    if (!name) return json({error:"Name required."});
    try{ await createSatsangType(DB,name); return json({success:`"${name}" added.`}); }
    catch{ return json({error:"That name already exists."}); }
  }
  if (intent==="toggle") {
    const id=parseInt(form.get("id") as string);
    const cur=form.get("current")==="1";
    await updateSatsangType(DB,id,{is_active:cur?0:1});
    return json({success:`Type ${cur?"disabled":"enabled"}.`});
  }
  if (intent==="delete") {
    const id=parseInt(form.get("id") as string);
    await deleteSatsangType(DB,id);
    return json({success:"Type deleted."});
  }
  return json({error:"Unknown action."});
}

export default function SatsangTypesPage() {
  const { types }  = useLoaderData<typeof loader>();
  const ad         = useActionData<typeof action>() as any;
  const nav        = useNavigation();
  const submitting = nav.state==="submitting";
  const { confirm, ConfirmDialog } = useConfirm();

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">🏛️ Satsang Types</h1>
      </div>
      <div className="admin-content">
        {ad?.success&&<div className="alert alert-success" style={{marginBottom:"16px"}}>✅ {ad.success}</div>}
        {ad?.error  &&<div className="alert alert-error"   style={{marginBottom:"16px"}}>⚠️ {ad.error}</div>}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:"20px"}}>
          <div className="card">
            <div className="card-header"><h3>Add Satsang Type</h3></div>
            <div className="card-body">
              <Form method="post" style={{display:"flex",gap:"10px"}}>
                <input type="hidden" name="intent" value="create"/>
                <input name="name" type="text" className="form-input" placeholder="e.g. Youth Satsang" style={{flex:1}} required title="Name of the new satsang type"/>
                <button type="submit" className="btn btn-primary btn-md" disabled={submitting} title="Add this satsang type">Add</button>
              </Form>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>All Types ({types.length})</h3></div>
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {types.map(t=>(
                  <tr key={t.id}>
                    <td style={{fontWeight:"500"}}>{t.name}</td>
                    <td><span className={`badge ${t.is_active?"badge-success":"badge-gray"}`}>{t.is_active?"Active":"Disabled"}</span></td>
                    <td style={{display:"flex",gap:"6px"}}>
                      <Form method="post">
                        <input type="hidden" name="intent"  value="toggle"/>
                        <input type="hidden" name="id"      value={t.id}/>
                        <input type="hidden" name="current" value={t.is_active?"1":"0"}/>
                        <button type="submit" className={`btn btn-sm ${t.is_active?"btn-secondary":"btn-outline"}`} title={t.is_active?"Disable — hides from session selector":"Enable — shows in session selector"}>{t.is_active?"Disable":"Enable"}</button>
                      </Form>
                      <Form method="post" onSubmit={async e=>{ e.preventDefault(); if (await confirm(`Delete "${t.name}"? This cannot be undone.`,{danger:true,title:"Delete Satsang Type",confirmLabel:"Delete"})) (e.target as HTMLFormElement).submit(); }}>
                        <input type="hidden" name="intent" value="delete"/>
                        <input type="hidden" name="id"     value={t.id}/>
                        <button type="submit" className="btn btn-sm btn-danger" title="Permanently delete this satsang type">🗑</button>
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
            <div style={{fontWeight:"700",marginBottom:"8px"}}>ℹ️ About Satsang Types</div>
            <ul style={{fontSize:"13px",color:"var(--gray-500)",paddingLeft:"18px",lineHeight:"1.9"}}>
              <li>Satsang types categorise sessions (e.g. Normal, EMS, Mahila).</li>
              <li>Selected when adding a schedule to a location.</li>
              <li>Appears in attendance reports and CSV export.</li>
              <li>Disabling hides it from new schedules — existing schedules keep their value.</li>
              <li>Deleting permanently removes the type. Existing attendance records are unaffected.</li>
            </ul>
          </div>
        </div>
      </div>
      {ConfirmDialog}
      <Toast message={(ad as any)?.error} type="error" />
      <Toast message={(ad as any)?.success} type="success" />
    </>
  );
}
