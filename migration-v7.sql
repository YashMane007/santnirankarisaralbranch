-- Migration v7: Admin-marked datetime columns on attendance table

ALTER TABLE attendance ADD COLUMN admin_marked_date TEXT;
ALTER TABLE attendance ADD COLUMN admin_marked_time TEXT;
