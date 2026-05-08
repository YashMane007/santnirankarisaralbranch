/**
 * App Settings — reads/writes key-value pairs in the `settings` D1 table.
 */

export interface AppSettings {
  app_name: string;
  org_name: string;
  welcome_message: string;
  footer_text: string;
  announcement_banner: string;
  audit_enabled: boolean;
  audit_retention_days: number;
  telegram_enabled: boolean;
  telegram_backup_time: string;
  telegram_backup_days: string;
  telegram_last_backup: string;
  location_history_enabled: boolean;
  export_default_columns: string;
  // Push notifications
  notifications_enabled: boolean;
  reminder_enabled: boolean;
  reminder_minutes_before: number; // minutes before session start to send reminder
}

const DEFAULTS: AppSettings = {
  app_name: "Sevadal Attendance",
  org_name: "Sant Nirankari Mission",
  welcome_message: "Welcome to Sevadal Attendance",
  footer_text: "Sant Nirankari Mission — Sevadal Attendance System",
  announcement_banner: "",
  audit_enabled: true,
  audit_retention_days: 0,
  telegram_enabled: false,
  telegram_backup_time: "00:06",
  telegram_backup_days: "mon,tue,wed,thu,fri,sat,sun",
  telegram_last_backup: "",
  location_history_enabled: true,
  export_default_columns: "all",
  notifications_enabled: false,
  reminder_enabled: false,
  reminder_minutes_before: 60,
};

export async function getAppSettings(db: D1Database): Promise<AppSettings> {
  const rows = await db
    .prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();

  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;

  return {
    app_name:                 map["app_name"]                 ?? DEFAULTS.app_name,
    org_name:                 map["org_name"]                 ?? DEFAULTS.org_name,
    welcome_message:          map["welcome_message"]          ?? DEFAULTS.welcome_message,
    footer_text:              map["footer_text"]              ?? DEFAULTS.footer_text,
    announcement_banner:      map["announcement_banner"]      ?? DEFAULTS.announcement_banner,
    audit_enabled:            (map["audit_enabled"]           ?? "1") === "1",
    audit_retention_days:     parseInt(map["audit_retention_days"] ?? "0"),
    telegram_enabled:         (map["telegram_enabled"]        ?? "0") === "1",
    telegram_backup_time:     map["telegram_backup_time"]     ?? DEFAULTS.telegram_backup_time,
    telegram_backup_days:     map["telegram_backup_days"]     ?? DEFAULTS.telegram_backup_days,
    telegram_last_backup:     map["telegram_last_backup"]     ?? "",
    location_history_enabled: (map["location_history_enabled"] ?? "1") === "1",
    export_default_columns:   map["export_default_columns"]   ?? DEFAULTS.export_default_columns,
    notifications_enabled:    (map["notifications_enabled"]   ?? "0") === "1",
    reminder_enabled:         (map["reminder_enabled"]        ?? "0") === "1",
    reminder_minutes_before:  parseInt(map["reminder_minutes_before"] ?? "60"),
  };
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .bind(key, value)
    .run();
}

export async function setSettings(
  db: D1Database,
  updates: Partial<Record<string, string>>
): Promise<void> {
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) await setSetting(db, k, v);
  }
}

export async function getSetting(
  db: D1Database,
  key: string,
  fallback = ""
): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? fallback;
}
