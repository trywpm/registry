-- normalize dependency keys to lowercase.
UPDATE "package_version" pv
SET "dependencies" = (
  SELECT jsonb_object_agg(lower(d.key), d.value)
  FROM jsonb_each(pv."dependencies") AS d(key, value)
)
WHERE pv."dependencies" IS NOT NULL
  AND pv."dependencies" != '{}'::jsonb
  AND EXISTS (
    SELECT 1 FROM jsonb_object_keys(pv."dependencies") AS k
    WHERE k <> lower(k)
  );

-- remove dependencies on packages that don't exist.
UPDATE "package_version" pv
SET "dependencies" = (
  SELECT jsonb_object_agg(d.key, d.value)
  FROM jsonb_each(pv."dependencies") AS d(key, value)
  WHERE EXISTS (SELECT 1 FROM "package" p WHERE p."name" = d.key)
)
WHERE pv."dependencies" IS NOT NULL
  AND pv."dependencies" != '{}'::jsonb
  AND EXISTS (
    SELECT 1 FROM jsonb_object_keys(pv."dependencies") AS k
    WHERE NOT EXISTS (SELECT 1 FROM "package" p WHERE p."name" = k)
  );

CREATE TABLE "package_dependent" (
  "dep_name" varchar(164) NOT NULL,
  "package_id" integer NOT NULL,
  "dep_range" varchar(64) NOT NULL,
  CONSTRAINT "package_dependent_pkey" PRIMARY KEY ("dep_name", "package_id"),
  CONSTRAINT "package_dependent_package_id_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."package"("id") ON DELETE cascade ON UPDATE no action
) WITH (fillfactor = 90);

CREATE INDEX "idx_package_dependent_package_id" ON "package_dependent" ("package_id");

INSERT INTO "package_dependent" ("dep_name", "package_id", "dep_range")
SELECT d.key, pv."package_id", d.value
FROM "package_dist_tag" t
JOIN "package_version" pv ON pv."package_id" = t."package_id" AND pv."version" = t."version"
CROSS JOIN LATERAL jsonb_each_text(pv."dependencies") AS d
WHERE t."tag" = 'latest'
  AND pv."dependencies" IS NOT NULL
  AND pv."dependencies" != '{}'::jsonb;

ANALYZE "package_dependent";
