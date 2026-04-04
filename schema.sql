-- Sevadal Attendance System — D1 Schema (v2)
-- Fresh install: npm run db:init
-- Existing install: run migration.sql instead

CREATE TABLE IF NOT EXISTS members (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL,
  phone          TEXT,
  dob            TEXT,
  gender         TEXT,
  zone           TEXT,
  pin_hash       TEXT,
  pin_salt       TEXT,
  pin_set        INTEGER DEFAULT 0,
  is_admin       INTEGER DEFAULT 0,
  is_super_admin INTEGER DEFAULT 0,
  is_active      INTEGER DEFAULT 1,
  photo_key      TEXT,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  address        TEXT,
  lat            REAL    NOT NULL,
  lng            REAL    NOT NULL,
  radius_meters  INTEGER DEFAULT 200,
  is_active      INTEGER DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_schedules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id       INTEGER NOT NULL REFERENCES locations(id),
  label             TEXT    NOT NULL,
  satsang_type_name TEXT,
  date              TEXT    NOT NULL,
  all_day           INTEGER DEFAULT 0,
  start_time        TEXT,
  end_time          TEXT,
  is_active         INTEGER DEFAULT 1,
  created_at        TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id        TEXT    NOT NULL,
  member_name      TEXT,
  seva_role        TEXT,
  location_id      INTEGER,
  location_name    TEXT,
  date             TEXT    NOT NULL,
  marked_at        TEXT,
  lat              REAL,
  lng              REAL,
  accuracy         REAL,
  distance_meters  INTEGER,
  schedule_id      INTEGER DEFAULT 0,
  satsang_type     TEXT,
  session_label    TEXT,
  marked_by_id     TEXT,
  marked_by_name   TEXT,
  UNIQUE(member_id, date, schedule_id)
);

CREATE TABLE IF NOT EXISTS satsang_types (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seva_roles_list (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_active  INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER DEFAULT 1,
  window_start TEXT    NOT NULL
);

INSERT OR IGNORE INTO satsang_types (name, sort_order) VALUES
  ('Normal Satsang', 1),
  ('EMS (English Medium Satsang)', 2),
  ('Mahila Satsang', 3),
  ('Baal Satsang', 4),
  ('Special Satsang', 5);

INSERT OR IGNORE INTO seva_roles_list (name, sort_order) VALUES
  ('Guard / Security', 1),
  ('Kitchen / Langar', 2),
  ('Parking', 3),
  ('Medical / First Aid', 4),
  ('Cleanliness', 5),
  ('Reception / Registration', 6),
  ('Sound / Media', 7),
  ('General Seva', 8);

CREATE INDEX IF NOT EXISTS idx_attendance_date        ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member      ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date_member ON attendance(date, member_id);
CREATE INDEX IF NOT EXISTS idx_loc_schedules_loc_date ON location_schedules(location_id, date);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key        ON rate_limits(key);
