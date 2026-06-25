-- Used for faster doc creation queries
CREATE INDEX IF NOT EXISTS "idx_package_version_doc"
  ON "package_version" ("package_id", "created" DESC)
  INCLUDE ("version", "requires");
