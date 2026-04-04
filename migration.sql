-- Sevadal Attendance — Cumulative Migration (v1 → v5)
-- Safe to run on any existing local database.
-- Uses IF NOT EXISTS / OR IGNORE so it never fails on duplicates.
--
-- Local:  wrangler d1 execute sevadal-db --local --file=./migration.sql
-- Prod:   wrangler d1 execute sevadal-db --file=./migration.sql

-- The safest approach for SQLite: just run migration-v5.sql which only
-- creates NEW tables with IF NOT EXISTS (no ALTER TABLE issues).

-- New tables only (safe to run multiple times)
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT,
  actor_name  TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     TEXT,
  ip_address  TEXT,
  lat         REAL,
  lng         REAL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_permission_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL,
  is_default  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  member_id   TEXT PRIMARY KEY,
  group_id    INTEGER,
  overrides   TEXT DEFAULT '{}',
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT,
  image_key   TEXT,
  type        TEXT DEFAULT 'notice',
  show_to     TEXT DEFAULT 'all',
  is_active   INTEGER DEFAULT 1,
  is_pinned   INTEGER DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT
);

CREATE TABLE IF NOT EXISTS location_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  accuracy      REAL,
  context       TEXT,
  attendance_id INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id     INTEGER,
  location_id     INTEGER,
  location_name   TEXT,
  session_label   TEXT,
  satsang_type    TEXT,
  date            TEXT NOT NULL,
  total_present   INTEGER DEFAULT 0,
  total_absent    INTEGER DEFAULT 0,
  created_by_id   TEXT,
  created_by_name TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_schedules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id       INTEGER NOT NULL,
  label             TEXT NOT NULL,
  satsang_type_name TEXT,
  date              TEXT NOT NULL,
  all_day           INTEGER DEFAULT 0,
  start_time        TEXT,
  end_time          TEXT,
  is_active         INTEGER DEFAULT 1,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS satsang_types (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seva_roles_list (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER DEFAULT 1,
  window_start TEXT NOT NULL
);

-- Default data
INSERT OR IGNORE INTO satsang_types (name, sort_order) VALUES
  ('Normal Satsang', 1), ('EMS (English Medium Satsang)', 2),
  ('Mahila Satsang', 3), ('Baal Satsang', 4), ('Special Satsang', 5);

INSERT OR IGNORE INTO seva_roles_list (name, sort_order) VALUES
  ('Guard / Security', 1), ('Kitchen / Langar', 2), ('Parking', 3),
  ('Medical / First Aid', 4), ('Cleanliness', 5),
  ('Reception / Registration', 6), ('Sound / Media', 7), ('General Seva', 8);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('app_name', 'Sevadal Attendance'),
  ('org_name', 'Sant Nirankari Mission'),
  ('welcome_message', 'Welcome to Sevadal Attendance'),
  ('footer_text', 'Sant Nirankari Mission — Sevadal Attendance System'),
  ('announcement_banner', ''),
  ('audit_enabled', '1'),
  ('audit_retention_days', '0'),
  ('telegram_enabled', '0'),
  ('telegram_backup_time', '00:06'),
  ('telegram_backup_days', 'mon,tue,wed,thu,fri,sat,sun'),
  ('telegram_last_backup', ''),
  ('location_history_enabled', '1'),
  ('export_default_columns', 'all'),
  ('maintenance_block_members', '0'),
  ('maintenance_block_admins', '0'),
  ('maintenance_message', 'Site is under maintenance. Please check back later.');

INSERT OR IGNORE INTO admin_permission_groups (name, permissions, is_default) VALUES (
  'Full Admin',
  '["view_members","add_members","edit_members","promote_admin","view_locations","add_locations","edit_locations","view_attendance","mark_attendance","edit_attendance","delete_attendance","export_data","view_audit_log","manage_announcements"]',
  1
);
INSERT OR IGNORE INTO admin_permission_groups (name, permissions, is_default) VALUES (
  'Attendance Only',
  '["view_members","view_attendance","mark_attendance","export_data"]',
  0
);
INSERT OR IGNORE INTO admin_permission_groups (name, permissions, is_default) VALUES (
  'Read Only',
  '["view_members","view_attendance","view_locations"]',
  0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_date        ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member      ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date_member ON attendance(date, member_id);
CREATE INDEX IF NOT EXISTS idx_loc_schedules_loc_date ON location_schedules(location_id, date);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key        ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor        ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created      ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_location_history       ON location_history(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active   ON announcements(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_session_history_date   ON session_history(date);
