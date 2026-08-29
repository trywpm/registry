ALTER TYPE "public"."package_type" RENAME TO "package_type_old";

CREATE TYPE "public"."package_type" AS ENUM('plugin', 'theme');

ALTER TABLE "package"
  ALTER COLUMN "type" TYPE "public"."package_type"
  USING "type"::text::"public"."package_type";

DROP TYPE "public"."package_type_old";
