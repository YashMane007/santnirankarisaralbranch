/**
 * Admin Permission System
 *
 * Two-layer:
 *  1. Permission Groups (SA defines groups with permission sets)
 *  2. Per-admin overrides on top of their group
 *
 * Super admins always have everything — this system only applies to normal admins.
 */

export type { Permission } from "~/lib/permission-types";
export { ALL_PERMISSIONS } from "~/lib/permission-types";
import type { Permission } from "~/lib/permission-types";
import { ALL_PERMISSIONS } from "~/lib/permission-types";


export interface PermissionGroup {
  id: number;
  name: string;
  permissions: Permission[];
  is_default: number;
}

export interface AdminPermissionRow {
  member_id: string;
  group_id: number | null;
  overrides: string; // JSON
}

/**
 * Get effective permissions for an admin.
 * Super admins skip this — they always have everything.
 */
export async function getAdminPermissions(
  db: D1Database,
  memberId: string,
  isSuperAdmin: boolean
): Promise<Set<Permission>> {
  if (isSuperAdmin) return new Set(ALL_PERMISSIONS.map(p => p.key));

  const row = await db
    .prepare("SELECT * FROM admin_permissions WHERE member_id = ?")
    .bind(memberId)
    .first<AdminPermissionRow>();

  // If no permission record → use default group
  let basePermissions: Permission[] = [];

  if (row?.group_id) {
    const group = await db
      .prepare("SELECT * FROM admin_permission_groups WHERE id = ?")
      .bind(row.group_id)
      .first<{ id: number; name: string; permissions: string }>();
    if (group) {
      try { basePermissions = JSON.parse(group.permissions); } catch {}
    }
  } else {
    // Use default group
    const defaultGroup = await db
      .prepare("SELECT * FROM admin_permission_groups WHERE is_default = 1 LIMIT 1")
      .first<{ permissions: string }>();
    if (defaultGroup) {
      try { basePermissions = JSON.parse(defaultGroup.permissions); } catch {}
    }
  }

  // Apply overrides
  const perms = new Set<Permission>(basePermissions);
  if (row?.overrides) {
    try {
      const overrides: Record<string, boolean> = JSON.parse(row.overrides);
      for (const [perm, allowed] of Object.entries(overrides)) {
        if (allowed) perms.add(perm as Permission);
        else perms.delete(perm as Permission);
      }
    } catch {}
  }

  return perms;
}

export function can(perms: Set<Permission>, permission: Permission): boolean {
  return perms.has(permission);
}

export async function listPermissionGroups(db: D1Database): Promise<PermissionGroup[]> {
  const r = await db.prepare("SELECT * FROM admin_permission_groups ORDER BY id").all<{id:number;name:string;permissions:string;is_default:number}>();
  return r.results.map(g => ({
    id: g.id,
    name: g.name,
    permissions: (() => { try { return JSON.parse(g.permissions); } catch { return []; } })(),
    is_default: g.is_default,
  }));
}

export async function setAdminPermissions(
  db: D1Database,
  memberId: string,
  groupId: number | null,
  overrides: Record<string, boolean>
): Promise<void> {
  await db.prepare(
    `INSERT INTO admin_permissions (member_id, group_id, overrides, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(member_id) DO UPDATE SET group_id = excluded.group_id, overrides = excluded.overrides, updated_at = excluded.updated_at`
  ).bind(memberId, groupId, JSON.stringify(overrides)).run();
}

export async function createPermissionGroup(
  db: D1Database,
  name: string,
  permissions: Permission[]
): Promise<void> {
  await db.prepare(
    "INSERT INTO admin_permission_groups (name, permissions) VALUES (?, ?)"
  ).bind(name, JSON.stringify(permissions)).run();
}

export async function updatePermissionGroup(
  db: D1Database,
  id: number,
  name: string,
  permissions: Permission[]
): Promise<void> {
  await db.prepare(
    "UPDATE admin_permission_groups SET name = ?, permissions = ? WHERE id = ?"
  ).bind(name, JSON.stringify(permissions), id).run();
}

export async function deletePermissionGroup(
  db: D1Database,
  id: number
): Promise<void> {
  // Unassign any admins using this group before deleting
  await db.prepare("UPDATE admin_permissions SET group_id = NULL WHERE group_id = ?").bind(id).run();
  await db.prepare("DELETE FROM admin_permission_groups WHERE id = ? AND is_default = 0").bind(id).run();
}

export async function getAdminPermissionRecord(
  db: D1Database,
  memberId: string
): Promise<AdminPermissionRow | null> {
  return db.prepare("SELECT * FROM admin_permissions WHERE member_id = ?").bind(memberId).first<AdminPermissionRow>();
}
