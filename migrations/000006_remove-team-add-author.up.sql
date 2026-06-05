-- Drop team column and add author column to package_version table.
ALTER TABLE package_version DROP COLUMN team;
ALTER TABLE package_version ADD COLUMN author varchar(164);
