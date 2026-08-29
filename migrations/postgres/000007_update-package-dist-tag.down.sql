ALTER TABLE "package_dist_tag" RESET (fillfactor);
ALTER TABLE "package_dist_tag" DROP CONSTRAINT "package_dist_tag_pkey";
ALTER TABLE "package_dist_tag" ADD CONSTRAINT "package_dist_tag_pkey" PRIMARY KEY ("tag", "package_id");
CREATE INDEX IF NOT EXISTS "idx_package_dist_tag_lookup" ON "package_dist_tag" ("package_id", "tag") INCLUDE ("version");
