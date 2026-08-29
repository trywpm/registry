ALTER TABLE "package_version"
RENAME COLUMN platform TO requires;

UPDATE "package_version"
SET
  requires = (
    SELECT
      jsonb_object_agg(key, replace(value, '^', '>='))
    FROM
      jsonb_each_text(requires)
  )
WHERE
  requires IS NOT NULL;
