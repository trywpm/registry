ALTER TABLE "package_dist_tag" DROP CONSTRAINT "package_dist_tag_pkey";
ALTER TABLE "package_dist_tag" ADD CONSTRAINT "package_dist_tag_pkey" PRIMARY KEY ("package_id", "tag");
DROP INDEX IF EXISTS "idx_package_dist_tag_lookup";
ALTER TABLE "package_dist_tag" SET (fillfactor = 90);
