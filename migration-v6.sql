-- Migration v6: Push Notifications + Notification Log

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

CREATE INDEX IF NOT EXISTS idx_push_subs_member ON push_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_type_date ON notification_log(notif_type, ref_date);
