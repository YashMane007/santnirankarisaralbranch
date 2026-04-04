-- Sevadal Attendance — Migration v5 → v6 (30 March 2026)
-- Upgrades announcement visibility system from single radio value to independent checkboxes
--
-- Local:  wrangler d1 execute sevadal-db --local --file=./migration-v6.sql
-- Prod:   wrangler d1 execute sevadal-db --file=./migration-v6.sql

-- Add new column for JSON array-based visibility (backwards compat)
ALTER TABLE announcements ADD COLUMN show_to_array TEXT;

-- Auto-migrate existing single-value show_to to JSON array
-- OLD: show_to = 'public' or 'all' → NEW: show_to_array = '["guest","member","admin"]'
-- OLD: show_to = 'members'       → NEW: show_to_array = '["member","admin"]'
-- OLD: show_to = 'admins'        → NEW: show_to_array = '["admin"]'
-- OLD: show_to = null/empty      → NEW: show_to_array = '[]' (invisible)

UPDATE announcements SET show_to_array = '["guest","member","admin"]' 
WHERE show_to = 'public' OR show_to = 'all' OR show_to IS NULL;

UPDATE announcements SET show_to_array = '["member","admin"]' 
WHERE show_to = 'members';

UPDATE announcements SET show_to_array = '["admin"]' 
WHERE show_to = 'admins';

-- Keep show_to for backwards compatibility (old code still reads it)
-- New code will primarily use show_to_array

-- Index for performance on the new array column
CREATE INDEX IF NOT EXISTS idx_announcements_show_to_array ON announcements(show_to_array);

-- Settings for telegram backup (mandatory feature)
INSERT OR IGNORE INTO settings (key, value) VALUES 
  ('telegram_backup_mandatory', '1');
