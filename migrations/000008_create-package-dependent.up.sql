CREATE TABLE "package_dependent" (
  "dep_name" varchar(164) NOT NULL,
  "package_id" integer NOT NULL,
  "version" varchar(64) NOT NULL,
  "dep_range" varchar(64) NOT NULL,
  CONSTRAINT "package_dependent_pkey" PRIMARY KEY ("dep_name", "package_id", "version"),
  CONSTRAINT "package_dependent_package_version_fkey" FOREIGN KEY ("package_id", "version") REFERENCES "public"."package_version"("package_id", "version") ON DELETE cascade ON UPDATE no action
);

INSERT INTO "package_dependent" ("dep_name", "package_id", "version", "dep_range")
SELECT d.key, pv."package_id", pv."version", d.value
FROM "package_version" pv, jsonb_each_text(pv."dependencies") AS d
WHERE pv."dependencies" IS NOT NULL AND pv."dependencies" != '{}'::jsonb;

ANALYZE "package_dependent";
