DROP INDEX IF EXISTS "idx_package_version_active_list";

ALTER TABLE "package_version" DROP COLUMN "yanked";
