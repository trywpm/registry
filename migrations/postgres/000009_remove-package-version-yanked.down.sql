ALTER TABLE "package_version" ADD COLUMN "yanked" boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_package_version_active_list" ON "package_version" ("package_id", "version") WHERE "yanked" = false;
