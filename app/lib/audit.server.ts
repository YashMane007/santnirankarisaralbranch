/**
 * Audit Log — records every significant action by any user.
 * Controlled by `audit_enabled` setting. SA can toggle on/off.
 * Retention: forever by default, SA can set retention days.
 */

export type AuditAction =
  | "login" | "logout" | "pin_changed" | "pin_reset"
  | "member_created" | "member_updated" | "member_deleted"
  | "member_activated" | "member_deactivated"
  | "admin_granted" | "admin_removed" | "sa_granted" | "sa_removed"
  | "bulk_import"
  | "location_created" | "location_updated" | "location_toggled"
  | "schedule_created" | "schedule_updated" | "schedule_deleted"
  | "attendance_marked" | "attendance_edited" | "attendance_deleted"
  | "bulk_attendance_marked"
  | "announcement_created" | "announcement_updated" | "announcement_deleted"
  | "setting_changed"
  | "export_downloaded" | "telegram_backup_sent"
  | "database_wiped"
  | "permission_group_created" | "permission_updated";

export interface AuditEntry {
  actorId: string;
  actorName: string;
  actorRole: "member" | "admin" | "super_admin";
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, any>;
  ip?: string;
  lat?: number;
  lng?: number;
}

export async function logAudit(db: D1Database, entry: AuditEntry): Promise<void> {
  // Check if audit is enabled
  try {
    const setting = await db.prepare("SELECT value FROM settings WHERE key = 'audit_enabled'").first<{value:string}>();
    if (setting?.value === "0") return;

    await db.prepare(
      `INSERT INTO audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      entry.actorId,
      entry.actorName,
      entry.actorRole,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ip ?? null,
      entry.lat ?? null,
      entry.lng ?? null
    ).run();
  } catch {
    // Never let audit logging crash the main request
  }
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  ip_address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export async function getAuditLog(
  db: D1Database,
  opts: {
    page?: number;
    pageSize?: number;
    actorId?: string;
    action?: string;
    from?: string;
    to?: string;
    search?: string;
  } = {}
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (opts.actorId) { clauses.push("actor_id = ?"); bindings.push(opts.actorId); }
  if (opts.action)  { clauses.push("action = ?");   bindings.push(opts.action); }
  if (opts.from)    { clauses.push("created_at >= ?"); bindings.push(opts.from + "T00:00:00"); }
  if (opts.to)      { clauses.push("created_at <= ?"); bindings.push(opts.to + "T23:59:59"); }
  if (opts.search)  { clauses.push("(actor_name LIKE ? OR actor_id LIKE ? OR action LIKE ?)"); bindings.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`); }

  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

  const [rows, totalRow] = await Promise.all([
    db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all<AuditLogRow>(),
    db.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).bind(...bindings).first<{cnt:number}>(),
  ]);

  return { rows: rows.results, total: totalRow?.cnt ?? 0 };
}

export async function purgeOldAuditLogs(db: D1Database, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
  const result = await db.prepare("DELETE FROM audit_log WHERE created_at < ?").bind(cutoff).run();
  return result.meta?.changes ?? 0;
}

export async function wipeAuditLog(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM audit_log").run();
}

/** Get IP from Cloudflare request headers */
export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0].trim()
    ?? "unknown";
}
