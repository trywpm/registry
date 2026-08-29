-- Optimize dist tag lookups
CREATE INDEX IF NOT EXISTS "idx_package_dist_tag_lookup" ON "package_dist_tag" ("package_id", "tag") INCLUDE ("version");

-- Optimize fetching active package versions
CREATE INDEX IF NOT EXISTS "idx_package_version_active_list" ON "package_version" ("package_id", "version") WHERE "yanked" = false;
