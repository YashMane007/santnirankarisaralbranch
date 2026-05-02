import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { requireSuperAdmin } from "~/lib/session.server";
import { listMembers } from "~/lib/db.server";
import {
  listPermissionGroups, setAdminPermissions, createPermissionGroup,
  updatePermissionGroup, deletePermissionGroup, getAdminPermissionRecord,
} from "~/lib/permissions.server";
import { logAudit, getClientIp } from "~/lib/audit.server";
import { ALL_PERMISSIONS, PERM_GROUPS, type Permission } from "~/lib/permission-types";
import { Toast } from "~/components/Toast";
import { useConfirm } from "~/components/ConfirmModal";

export const meta: MetaFunction = () => [{ title: "Permissions — Sevadal Admin" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const { DB } = context.cloudflare.env;
  const [groups, allMembers] = await Promise.all([listPermissionGroups(DB), listMembers(DB)]);
  const admins = allMembers.filter(m => m.is_admin && !m.is_super_admin);

  const adminPerms: Record<string, { group_id: number | null; overrides: string; group_name: string | null }> = {};
  for (const admin of admins) {
    const rec = await getAdminPermissionRecord(DB, admin.id);
    const groupName = rec?.group_id
      ? groups.find(g => g.id === rec.group_id)?.name ?? null
      : groups.find(g => g.is_default)?.name ?? "Full Admin (default)";
    adminPerms[admin.id] = { group_id: rec?.group_id ?? null, overrides: rec?.overrides ?? "{}", group_name: groupName };
  }

  return json({ groups, admins, adminPerms });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { DB, SESSION_SECRET } = context.cloudflare.env;
  const session = await requireSuperAdmin(request, SESSION_SECRET, DB);
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const ip = getClientIp(request);

  if (intent === "create-group") {
    const name = (form.get("name") as string)?.trim();
    if (!name) return json({ error: "Name required." });
    const perms = (form.getAll("perms") as string[]) as Permission[];
    await createPermissionGroup(DB, name, perms);
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "permission_group_created", details: { name, permCount: perms.length }, ip });
    return json({ success: `Group "${name}" created.` });
  }

  if (intent === "update-group") {
    const id = parseInt(form.get("id") as string);
    const name = (form.get("name") as string)?.trim();
    const perms = (form.getAll("perms") as string[]) as Permission[];
    if (!name) return json({ error: "Name required." });
    await updatePermissionGroup(DB, id, name, perms);
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "permission_updated", details: { groupId: id, name, permCount: perms.length }, ip });
    return json({ success: "Group updated." });
  }

  if (intent === "delete-group") {
    const id = parseInt(form.get("id") as string);
    await deletePermissionGroup(DB, id);
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "permission_updated", details: { deletedGroupId: id }, ip });
    return json({ success: "Group deleted. Affected admins reset to default group." });
  }

  if (intent === "set-admin-perm") {
    const memberId = form.get("memberId") as string;
    const groupId = form.get("groupId") ? parseInt(form.get("groupId") as string) : null;
    const overrideKeys = form.getAll("override_key") as string[];
    const overrideVals = form.getAll("override_val") as string[];
    const overrides: Record<string, boolean> = {};
    overrideKeys.forEach((k, i) => { if (k) overrides[k] = overrideVals[i] === "1"; });
    await setAdminPermissions(DB, memberId, groupId, overrides);
    await logAudit(DB, { actorId: session.memberId, actorName: session.memberName, actorRole: "super_admin", action: "permission_updated", details: { targetMember: memberId, groupId }, ip });
    return json({ success: "Permissions updated." });
  }

  return json({ error: "Unknown." });
}

function PermCheckbox({ pKey, checked, onChange }: { pKey: Permission; checked: boolean; onChange: (k: Permission, v: boolean) => void }) {
  const perm = ALL_PERMISSIONS.find(p => p.key === pKey)!;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
      <input type="checkbox" name="perms" value={pKey} checked={checked} onChange={e => onChange(pKey, e.target.checked)} style={{ width: "14px", height: "14px", accentColor: "var(--primary)" }} />
      {perm?.label ?? pKey}
    </label>
  );
}

export default function AdminPermissionsPage() {
  const { groups, admins, adminPerms } = useLoaderData<typeof loader>();
  const ad = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const { confirm, ConfirmDialog } = useConfirm();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editGroup, setEditGroup] = useState<typeof groups[0] | null>(null);
  const [newGroupPerms, setNewGroupPerms] = useState<Set<Permission>>(new Set());
  const [editGroupPerms, setEditGroupPerms] = useState<Set<Permission>>(new Set());
  const [selectedAdmin, setSelectedAdmin] = useState(admins[0]?.id ?? "");

  const selectedAdminPerm = adminPerms[selectedAdmin];
  const [selectedGroup, setSelectedGroup] = useState<string>(selectedAdminPerm?.group_id?.toString() ?? "");

  return (
    <>
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">🔐 Admin Permissions</h1>
      </div>
      <div className="admin-content">
        {ad?.success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>✅ {ad.success}</div>}
        {ad?.error   && <div className="alert alert-error"   style={{ marginBottom: "16px" }}>⚠️ {ad.error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>

          {/* ── Permission Groups ── */}
          <div className="card">
            <div className="card-header">
              <h3>Permission Groups</h3>
              <button className="btn btn-sm btn-primary" onClick={() => setShowNewGroup(true)}>+ New</button>
            </div>
            <div style={{ padding: "12px" }}>
              {groups.map(g => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-100)", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontWeight: "600" }}>{g.name} {g.is_default ? <span className="badge badge-gray" style={{ fontSize: "10px" }}>default</span> : null}</div>
                    <div style={{ fontSize: "11px", color: "var(--gray-400)" }}>{g.permissions.length} permissions</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setEditGroup(g); setEditGroupPerms(new Set(g.permissions)); }} title="Edit this group">✏️</button>
                    {!g.is_default && (
                      <Form method="post" onSubmit={async e => {
                        e.preventDefault();
                        if (await confirm(`Delete group "${g.name}"? Admins using it will be reset to the default group.`, { danger: true, title: "Delete Group", confirmLabel: "Delete" }))
                          (e.target as HTMLFormElement).submit();
                      }}>
                        <input type="hidden" name="intent" value="delete-group" />
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="btn btn-sm btn-danger" title="Delete this group">🗑</button>
                      </Form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Set Admin Permissions ── */}
          <div className="card">
            <div className="card-header"><h3>Set Admin Permissions</h3></div>
            <div className="card-body">
              {admins.length === 0 ? (
                <div className="empty-state"><div className="empty-state__text">No normal admins found. Create an admin member first.</div></div>
              ) : (
                <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <input type="hidden" name="intent" value="set-admin-perm" />
                  <div className="form-group">
                    <label className="form-label">Admin Member</label>
                    <select className="form-select" name="memberId" value={selectedAdmin} onChange={e => {
                      setSelectedAdmin(e.target.value);
                      setSelectedGroup(adminPerms[e.target.value]?.group_id?.toString() ?? "");
                    }}>
                      {admins.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Permission Group</label>
                    <select className="form-select" name="groupId" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                      <option value="">— Use Default Group —</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--gray-500)" }}>
                    ℹ️ Individual overrides can be set here for specific exceptions beyond the group.
                  </div>
                  <button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting ? "Saving…" : "Save Permissions"}</button>
                </Form>
              )}
            </div>
          </div>
        </div>

        {/* ── Admin List with their current groups ── */}
        {admins.length > 0 && (
          <div className="card" style={{ marginTop: "20px" }}>
            <div className="card-header"><h3>Current Admin Permissions</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>ID</th>
                    <th>Permission Group</th>
                    <th>Overrides</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map(a => {
                    const p = adminPerms[a.id];
                    let overrideCount = 0;
                    try { overrideCount = Object.keys(JSON.parse(p?.overrides ?? "{}")).length; } catch {}
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: "600" }}>{a.name}</td>
                        <td style={{ fontSize: "12px", color: "var(--gray-500)" }}>{a.id}</td>
                        <td>
                          <span className="badge badge-primary" style={{ fontSize: "11px" }}>
                            {p?.group_name ?? "Full Admin (default)"}
                          </span>
                        </td>
                        <td>
                          {overrideCount > 0
                            ? <span className="badge badge-warning" style={{ fontSize: "11px" }}>{overrideCount} override{overrideCount > 1 ? "s" : ""}</span>
                            : <span style={{ fontSize: "12px", color: "var(--gray-400)" }}>None</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: "20px" }}>
          <div className="card-body">
            <div style={{ fontWeight: "700", marginBottom: "8px" }}>ℹ️ How Permissions Work</div>
            <ul style={{ fontSize: "13px", color: "var(--gray-500)", paddingLeft: "18px", lineHeight: "2" }}>
              <li>Super admins always have ALL permissions — this page doesn't affect them.</li>
              <li>Each admin gets a Permission Group as their base set.</li>
              <li>Individual overrides can add or remove specific permissions on top.</li>
              <li>If no group is assigned, the "Full Admin" default group is used.</li>
              <li>Permission checks happen server-side — cannot be bypassed.</li>
              <li>The default group cannot be deleted.</li>
            </ul>
          </div>
        </div>
      </div>

      {ConfirmDialog}

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowNewGroup(false); }}>
          <div className="modal-box" style={{ maxWidth: "500px" }}>
            <div className="modal-header"><h3>New Permission Group</h3><button className="modal-close" type="button" onClick={() => setShowNewGroup(false)}>✕</button></div>
            <Form method="post" onSubmit={() => setShowNewGroup(false)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="create-group" />
                <div className="form-group" style={{ marginBottom: "16px" }}><label className="form-label">Group Name *</label><input name="name" type="text" className="form-input" required /></div>
                {PERM_GROUPS.map(grp => (
                  <div key={grp} style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--gray-500)", marginBottom: "6px" }}>{grp}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      {ALL_PERMISSIONS.filter(p => p.group === grp).map(p => (
                        <PermCheckbox key={p.key} pKey={p.key} checked={newGroupPerms.has(p.key)} onChange={(k, v) => setNewGroupPerms(prev => { const n = new Set(prev); v ? n.add(k) : n.delete(k); return n; })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={() => setShowNewGroup(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting ? "Creating…" : "Create Group"}</button></div>
            </Form>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editGroup && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditGroup(null); }}>
          <div className="modal-box" style={{ maxWidth: "500px" }}>
            <div className="modal-header"><h3>Edit Group — {editGroup.name}</h3><button className="modal-close" type="button" onClick={() => setEditGroup(null)}>✕</button></div>
            <Form method="post" onSubmit={() => setEditGroup(null)}>
              <div className="modal-body">
                <input type="hidden" name="intent" value="update-group" />
                <input type="hidden" name="id" value={editGroup.id} />
                <div className="form-group" style={{ marginBottom: "16px" }}><label className="form-label">Group Name *</label><input name="name" type="text" className="form-input" defaultValue={editGroup.name} required /></div>
                {PERM_GROUPS.map(grp => (
                  <div key={grp} style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--gray-500)", marginBottom: "6px" }}>{grp}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      {ALL_PERMISSIONS.filter(p => p.group === grp).map(p => (
                        <PermCheckbox key={p.key} pKey={p.key} checked={editGroupPerms.has(p.key)} onChange={(k, v) => setEditGroupPerms(prev => { const n = new Set(prev); v ? n.add(k) : n.delete(k); return n; })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary btn-md" onClick={() => setEditGroup(null)}>Cancel</button><button type="submit" className="btn btn-primary btn-md" disabled={submitting}>{submitting ? "Saving…" : "Save"}</button></div>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
