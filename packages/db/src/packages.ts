import type { Package } from '@wpm/manifest';
import type { Role as PackageRole } from '@wpm/rbac';
import type { PackageStatus } from '@wpm/util/constants';

import type { PackageId, UserId } from './types';

import { Base } from './base';

const SEVEN_DAYS = 60 * 60 * 24 * 7;
const FIVE_MINUTES = 60 * 5;

export type PackageVersionEntry = Omit<Package, 'name' | 'visibility' | 'tag' | 'readme'> & {
  created: string;
  modified: string;
};

export type PackageManifest = Pick<Package, 'name' | 'type' | 'visibility'> & {
  'dist-tags': Record<string, string>;
  versions: PackageVersionEntry[];
  created: string;
  modified: string;
};

export type PackageDetails = {
  id: PackageId;
  type: Package['type'];
  status: PackageStatus;
  visibility: Package['visibility'];
};

export type PackageIdAndVisibility = {
  id: PackageId;
  status: PackageStatus;
  visibility: Package['visibility'];
};

export type PackageAccess = {
  role: PackageRole | null;
  status: PackageStatus;
  visibility: Package['visibility'];
};

export type PackageVersionInput = Omit<Package, 'name' | 'visibility' | 'tag' | 'readme'> & {
  released_by: UserId;
};

export class Packages extends Base {
  /** Lookup id, status, visibility by package name. */
  async getIdByName(name: string): Promise<PackageIdAndVisibility | null> {
    return this.cached<PackageIdAndVisibility>(
      `pkg:idv:${name}`,
      async () => {
        const [row] = await this.db<[PackageIdAndVisibility?]>`
          SELECT "id", "status", "visibility"
          FROM "public"."package"
          WHERE "name" = ${name}
        `;
        return row ?? null;
      },
      { ttl: SEVEN_DAYS },
    );
  }

  /** All non-deleted package names. */
  async getAllNames(): Promise<string[]> {
    const rows = await this.db<{ name: string }[]>`
      SELECT "name"
      FROM "public"."package"
      WHERE "status" != 'deleted'
    `;
    return rows.map((r) => r.name);
  }

  /** Lookup full package manifest by name, including all versions and dist-tags. */
  async getByName(name: string): Promise<PackageManifest | null> {
    const [row] = await this.db<[{ manifest: PackageManifest }?]>`
      SELECT json_build_object(
        'name', p."name",
        'type', p."type",
        'visibility', p."visibility",
        'dist-tags', COALESCE(pt."dist_tags", '{}'::jsonb),
        'versions', COALESCE(pv."versions", '[]'::jsonb),
        'created', to_char(p."created" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'modified', to_char(p."modified" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS "manifest"
      FROM "public"."package" p
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(t.tag, t.version) AS "dist_tags"
        FROM "public"."package_dist_tag" t
        WHERE t."package_id" = p."id"
      ) pt ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'version', v."version",
            '_wpm', v."_wpm",
            'dist', v."dist",
            'description', v."description",
            'requires', v."requires",
            'license', v."license",
            'homepage', v."homepage",
            'tags', v."tags",
            'team', v."team",
            'dependencies', v."dependencies",
            'devDependencies', v."devDependencies",
            'created', to_char(v."created" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'modified', to_char(v."modified" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ))
          ORDER BY v."created" ASC
        ) AS "versions"
        FROM "public"."package_version" v
        WHERE v."package_id" = p."id" AND v."yanked" = false
      ) pv ON true
      WHERE p."name" = ${name} AND p."status" != 'deleted'
    `;
    return row?.manifest ?? null;
  }

  /** Lookup full package details by name. */
  async getDetailsByName(name: string): Promise<PackageDetails | null> {
    return this.cached<PackageDetails>(
      `pkg:details:${name}`,
      async () => {
        const [row] = await this.db<[PackageDetails?]>`
          SELECT "id", "type", "status", "visibility"
          FROM "public"."package"
          WHERE "name" = ${name}
        `;
        return row ?? null;
      },
      { ttl: FIVE_MINUTES },
    );
  }

  /** Returns the user's role on a package, or null if no access. */
  async getAccess(name: string, userId: UserId) {
    return this.cached<PackageAccess>(
      `pkg:access:ctx:${name}:${userId}`,
      async () => {
        const [row] = await this.db<[PackageAccess?]>`
          SELECT p.status, p.visibility, pa.role
          FROM "package" p
          LEFT JOIN "package_access" pa
            ON p.id = pa.package_id AND pa.user_id = ${userId}
          WHERE p.name = ${name} AND p.status != 'deleted'
        `;

        return row ?? null;
      },
      { ttl: 604800, cacheNull: true },
    );
  }

  /** Whether a specific version of a package exists. Versions are immutable. */
  async hasVersion(packageId: PackageId, version: string): Promise<boolean> {
    const cached = await this.cached<{ exists: true }>(
      `pkg:has-version:${packageId}:${version}`,
      async () => {
        const [row] = await this.db<[{ exists: boolean }?]>`
          SELECT EXISTS (
            SELECT 1
            FROM "public"."package_version"
            WHERE "package_id" = ${packageId} AND "version" = ${version}
          ) AS "exists"
        `;
        return row?.exists ? { exists: true } : null;
      },
      { ttl: SEVEN_DAYS },
    );

    return cached != null;
  }

  /** Insert a new package row. Returns the generated id. */
  async insert(
    name: string,
    type: Package['type'],
    visibility: Package['visibility'],
  ): Promise<PackageId> {
    const [row] = await this.db<[{ id: PackageId }]>`
      INSERT INTO "public"."package" ("name", "type", "status", "visibility")
      VALUES (${name}, ${type}, 'active', ${visibility})
      RETURNING "id"
    `;
    return row.id;
  }

  /** Insert a new package version row. */
  async insertVersion(packageId: PackageId, input: PackageVersionInput): Promise<void> {
    await this.db`
      INSERT INTO "public"."package_version" (
        "description", "version", "requires", "license", "homepage",
        "tags", "team", "dependencies", "devDependencies",
        "released_by", "dist", "_wpm", "yanked", "package_id"
      )
      VALUES (
        ${input.description ?? null}, ${input.version},
        ${this.db.json(input.requires ?? null)}, ${input.license ?? null},
        ${input.homepage ?? null}, ${input.tags ?? null}, ${input.team ?? null},
        ${this.db.json(input.dependencies ?? null)},
        ${this.db.json(input.devDependencies ?? null)},
        ${input.released_by}, ${this.db.json(input.dist)}, ${input._wpm},
        false, ${packageId}
      )
    `;
  }

  /** Upsert a dist-tag for a package version. */
  async insertDistTag(packageId: PackageId, tag: string, version: string): Promise<void> {
    await this.db`
      INSERT INTO "public"."package_dist_tag" ("tag", "package_id", "version")
      VALUES (${tag}, ${packageId}, ${version})
      ON CONFLICT ("tag", "package_id") DO UPDATE
      SET "version" = excluded."version"
    `;
  }

  /** Grant a user a role on a package. */
  async insertAccess(
    packageId: PackageId,
    userId: UserId,
    role: PackageRole,
    addedBy: UserId,
  ): Promise<void> {
    await this.db`
      INSERT INTO "public"."package_access" ("package_id", "user_id", "role", "added_by")
      VALUES (${packageId}, ${userId}, ${role}, ${addedBy})
    `;
  }

  /** Publish a new version: insert version + upsert dist-tag, atomically. */
  async publishVersion(
    packageId: PackageId,
    input: PackageVersionInput,
    distTag: string,
  ): Promise<void> {
    await this.db.begin(async (sql) => {
      await sql`
        INSERT INTO "public"."package_version" (
          "description", "version", "requires", "license", "homepage",
          "tags", "team", "dependencies", "devDependencies",
          "released_by", "dist", "_wpm", "yanked", "package_id"
        )
        VALUES (
          ${input.description ?? null}, ${input.version},
          ${sql.json(input.requires ?? null)}, ${input.license ?? null},
          ${input.homepage ?? null}, ${input.tags ?? null}, ${input.team ?? null},
          ${sql.json(input.dependencies ?? null)},
          ${sql.json(input.devDependencies ?? null)},
          ${input.released_by}, ${sql.json(input.dist)}, ${input._wpm},
          false, ${packageId}
        )
      `;

      await sql`
        INSERT INTO "public"."package_dist_tag" ("tag", "package_id", "version")
        VALUES (${distTag}, ${packageId}, ${input.version})
        ON CONFLICT ("tag", "package_id") DO UPDATE
        SET "version" = excluded."version"
      `;
    });

    await this.invalidate(`pkg:has-version:${packageId}:${input.version}`);
  }

  /** Create a new package and grant the creator admin access, atomically. */
  async create(
    name: string,
    type: Package['type'],
    visibility: Package['visibility'],
    createdBy: UserId,
  ): Promise<PackageId> {
    return this.db.begin(async (sql) => {
      const [pkg] = await sql<[{ id: PackageId }]>`
        INSERT INTO "public"."package" ("name", "type", "status", "visibility")
        VALUES (${name}, ${type}, 'active', ${visibility})
        RETURNING "id"
      `;

      await sql`
        INSERT INTO "public"."package_access" ("package_id", "user_id", "role", "added_by")
        VALUES (${pkg.id}, ${createdBy}, 'admin', ${createdBy})
      `;

      return pkg.id;
    });
  }

  /** Hard-delete a package by name. Cascades to versions, dist-tags, access. */
  async deleteByName(name: string): Promise<void> {
    await this.invalidate([`pkg:idv:${name}`, `pkg:details:${name}`]);

    await this.db`DELETE FROM "public"."package" WHERE "name" = ${name}`;
  }
}
