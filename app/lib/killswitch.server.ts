/**
 * Kill switch / maintenance mode helper.
 * Settings stored in D1 `settings` table.
 * Keys:
 *   maintenance_block_members  = "1" | "0"
 *   maintenance_block_admins   = "1" | "0"
 *   maintenance_block_login    = "1" | "0"
 *   maintenance_block_guests   = "1" | "0"
 *   maintenance_message        = string
 */

export interface KillSwitchState {
  blockMembers: boolean;
  blockAdmins: boolean;
  blockLogin: boolean;
  blockGuests: boolean;
  message: string;
}

export async function getKillSwitch(db: D1Database): Promise<KillSwitchState> {
  const rows = await db
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('maintenance_block_members','maintenance_block_admins','maintenance_block_login','maintenance_block_guests','maintenance_message')"
    )
    .all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;
  return {
    blockMembers: map["maintenance_block_members"] === "1",
    blockAdmins:  map["maintenance_block_admins"]  === "1",
    blockLogin:   map["maintenance_block_login"]   === "1",
    blockGuests:  map["maintenance_block_guests"]  === "1",
    message:      map["maintenance_message"] ?? "Site is under maintenance. Please check back later.",
  };
}

export async function setKillSwitch(
  db: D1Database,
  data: Partial<{ blockMembers: boolean; blockAdmins: boolean; blockLogin: boolean; blockGuests: boolean; message: string }>
): Promise<void> {
  const ops: Promise<any>[] = [];
  if (data.blockMembers !== undefined)
    ops.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('maintenance_block_members',?)").bind(data.blockMembers ? "1" : "0").run());
  if (data.blockAdmins !== undefined)
    ops.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('maintenance_block_admins',?)").bind(data.blockAdmins ? "1" : "0").run());
  if (data.blockLogin !== undefined)
    ops.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('maintenance_block_login',?)").bind(data.blockLogin ? "1" : "0").run());
  if (data.blockGuests !== undefined)
    ops.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('maintenance_block_guests',?)").bind(data.blockGuests ? "1" : "0").run());
  if (data.message !== undefined)
    ops.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('maintenance_message',?)").bind(data.message).run());
  await Promise.all(ops);
}

/**
 * role "super"  → always passes through.
 * role "admin"  → blocked only if blockAdmins is on.
 * role "member" → blocked only if blockMembers is on.
 * role "guest"  → blocked only if blockGuests is on.
 * Returns null if OK, or the maintenance message string if blocked.
 */
export function shouldBlock(ks: KillSwitchState, role: "member" | "admin" | "super" | "guest"): string | null {
  if (role === "super")  return null;
  if (role === "admin"  && ks.blockAdmins)  return ks.message;
  if (role === "member" && ks.blockMembers) return ks.message;
  if (role === "guest"  && ks.blockGuests)  return ks.message;
  return null;
}
