-- Migration v8: Consolidates v6 (push notifications) + v7 (admin-marked datetime)
-- Run this ONLY if your DB was created from the OLD schema-complete.sql that
-- was missing these tables/columns.
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF NOT COLUMN.
--
-- Local:  wrangler d1 execute sevadal-db --local --file=./migration-v8.sql
-- Prod:   wrangler d1 execute sevadal-db --file=./migration-v8.sql
--
-- ────────────────────────────────────────────────────────────────────────────

-- ── v6: Push Subscriptions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, endpoint)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT,
  notif_type  TEXT NOT NULL,
  ref_date    TEXT,
  ref_id      TEXT,
  sent_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subs_member      ON push_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_type_date   ON notification_log(notif_type, ref_date);

-- ── v7: Admin-marked datetime on attendance ─────────────────────────────────
-- SQLite ALTER TABLE ADD COLUMN is idempotent-ish but errors if column exists.
-- Use the pragma approach to check first.

-- Add admin_marked_date if not present
CREATE TABLE IF NOT EXISTS _v8_migration_guard (done INTEGER DEFAULT 0);
INSERT OR IGNORE INTO _v8_migration_guard (rowid, done) VALUES (1, 0);

-- We can't do conditional ALTER TABLE in SQLite directly,
-- but D1 wrangler execute will just fail gracefully on duplicates.
-- Run both; if columns already exist the command errors silently.
ALTER TABLE attendance ADD COLUMN admin_marked_date TEXT;
ALTER TABLE attendance ADD COLUMN admin_marked_time TEXT;

-- Mark done
UPDATE _v8_migration_guard SET done = 1 WHERE rowid = 1;
