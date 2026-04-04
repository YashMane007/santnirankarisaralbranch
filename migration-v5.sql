-- Sevadal v5 Migration
-- Run: wrangler d1 execute sevadal-db --local --file=./migration-v5.sql
-- Prod: wrangler d1 execute sevadal-db --file=./migration-v5.sql

-- 1. Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT,
  actor_name  TEXT,
  actor_role  TEXT,   -- member | admin | super_admin
  action      TEXT NOT NULL,
  target_type TEXT,   -- member | location | attendance | setting | announcement
  target_id   TEXT,
  details     TEXT,   -- JSON: { before, after, extra }
  ip_address  TEXT,
  lat         REAL,
  lng         REAL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 2. Admin Permission Groups
CREATE TABLE IF NOT EXISTS admin_permission_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL, -- JSON array of permission keys
  is_default  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 3. Admin Permissions (per-person)
CREATE TABLE IF NOT EXISTS admin_permissions (
  member_id   TEXT PRIMARY KEY,
  group_id    INTEGER,
  overrides   TEXT DEFAULT '{}', -- JSON: { "add_members": true, "delete_members": false }
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 4. Announcements / Notice Board
CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT,
  image_key   TEXT,
  type        TEXT DEFAULT 'notice', -- notice | poster | contact | gallery
  show_to     TEXT DEFAULT 'all',    -- all | members | admins
  is_active   INTEGER DEFAULT 1,
  is_pinned   INTEGER DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT
);

-- 5. Location History (GPS path per member)
CREATE TABLE IF NOT EXISTS location_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  accuracy    REAL,
  context     TEXT, -- attendance_mark | login | manual
  attendance_id INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 6. Session History (admin-created sessions record)
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

-- 7. App Settings extensions (key-value, extends existing settings table)
-- These are inserted as defaults if not already present
INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'Sevadal Attendance');
INSERT OR IGNORE INTO settings (key, value) VALUES ('org_name', 'Sant Nirankari Mission');
INSERT OR IGNORE INTO settings (key, value) VALUES ('welcome_message', 'Welcome to Sevadal Attendance');
INSERT OR IGNORE INTO settings (key, value) VALUES ('footer_text', 'Sant Nirankari Mission — Sevadal Attendance System');
INSERT OR IGNORE INTO settings (key, value) VALUES ('announcement_banner', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('audit_enabled', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('audit_retention_days', '0'); -- 0 = forever
INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_enabled', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_backup_time', '00:06');
INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_backup_days', 'mon,tue,wed,thu,fri,sat,sun');
INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_last_backup', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('location_history_enabled', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('export_default_columns', 'all');

-- Default permission groups
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
CREATE INDEX IF NOT EXISTS idx_audit_log_actor    ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action   ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_location_history   ON location_history(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_session_history_date ON session_history(date);
