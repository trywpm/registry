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

WITH no_latest AS (
  SELECT p."id" FROM "package" p
  WHERE EXISTS (SELECT 1 FROM "package_version" pv WHERE pv."package_id" = p."id")
    AND NOT EXISTS (SELECT 1 FROM "package_dist_tag" t WHERE t."package_id" = p."id" AND t."tag" = 'latest')
),
ranked AS (
  SELECT pv."package_id", pv."version",
    row_number() OVER (
      PARTITION BY pv."package_id"
      ORDER BY
        string_to_array(split_part(split_part(pv."version", '+', 1), '-', 1), '.')::bigint[] DESC,
        (position('-' IN split_part(pv."version", '+', 1)) = 0) DESC,
        (
          SELECT array_agg(
            (CASE WHEN t.id ~ '^[0-9]+$' THEN '0' || lpad(t.id, 20, '0') ELSE '1' || t.id END) COLLATE "C"
            ORDER BY t.ord
          )
          FROM unnest(string_to_array(
            CASE WHEN position('-' IN split_part(pv."version", '+', 1)) > 0
              THEN substr(split_part(pv."version", '+', 1), position('-' IN split_part(pv."version", '+', 1)) + 1)
            END, '.')) WITH ORDINALITY AS t(id, ord)
        ) DESC,
        pv."created" DESC
    ) rn
  FROM "package_version" pv
  JOIN no_latest nl ON nl."id" = pv."package_id"
  WHERE pv."yanked" = false
)
INSERT INTO "package_dist_tag" ("tag", "package_id", "version")
SELECT 'latest', "package_id", "version" FROM ranked WHERE rn = 1;

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
