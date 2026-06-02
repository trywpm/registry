import type { Package } from '@wpm/manifest';
import type { Role as PackageRole } from '@wpm/rbac';
import type { PackageStatus, PackageId, UserId, PackageType, PackageVisibility } from '@wpm/types';

import { Base } from './base';

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

export type GetOrInsertPackageResult = {
  id: PackageId;
  role: PackageRole | null;
  type: PackageType;
  is_new: boolean;
  status: PackageStatus;
  visibility: PackageVisibility;
  versionExists: boolean;
};

export class Packages extends Base {
  async getAccess(name: string, userId: UserId) {
    return this.cached<PackageAccess>(
      `pkg:access:${name}:${userId}`,
      async () => {
        const [row] = await this.db<[PackageAccess?]>`
          select p.status, p.visibility, pa.role
          from "package" p
          left join "package_access" pa
            on p.id = pa.package_id and pa.user_id = ${userId}
          where p.name = ${name} and p.status != 'deleted'
        `;

        return row ?? null;
      },
      { ttl: 604800, cacheNull: true },
    );
  }

  async insertVersion(manifest: Package, userId: UserId, packageId: PackageId) {
    await this.db.begin(async (sql) => {
      await sql`
        insert into
          "package_version" (
            "description",
            "version",
            "requires",
            "license",
            "homepage",
            "tags",
            "team",
            "dependencies",
            "devDependencies",
            "released_by",
            "dist",
            "_wpm",
            "package_id"
          )
        values
          (
            ${manifest.description ?? null},
            ${manifest.version},
            ${manifest.requires ? sql.json(manifest.requires) : null},
            ${manifest.license ?? null},
            ${manifest.homepage ?? null},
            ${manifest.tags ?? null},
            ${manifest.team ?? null},
            ${manifest.dependencies ? sql.json(manifest.dependencies) : null},
            ${manifest.devDependencies ? sql.json(manifest.devDependencies) : null},
            ${userId},
            ${sql.json(manifest.dist)},
            ${manifest._wpm},
            ${packageId}
          )
      `;

      const distTag = manifest.tag || 'latest';
      if (distTag !== 'untagged') {
        await sql`
          insert into
            "package_dist_tag" ("tag", "package_id", "version")
          values
            (${distTag}, ${packageId}, ${manifest.version})
          on conflict ("tag", "package_id") do update
          set
            "version" = excluded."version"
        `;
      }
    });
  }

  async getOrInsert(
    name: string,
    version: string,
    type: PackageType,
    visibility: PackageVisibility,
    userId: UserId,
  ): Promise<GetOrInsertPackageResult> {
    const [row] = await this.db<[GetOrInsertPackageResult?]>`
      with
        insert_package as (
          insert into "package" (
            "name", "type", "status", "visibility"
          )
          values
            (
              ${name}, ${type}, 'active', ${visibility}
            ) on conflict ("name") do nothing
          returning
            "id",
            "status"
        ),
        insert_access as (
          insert into "package_access" (
            "package_id", "user_id", "role", "added_by"
          )
          select
            "id",
            ${userId},
            'admin' :: "package_role",
            ${userId}
          from
            insert_package
          returning
            "package_id",
            "role"
        )
      select
        "package_id" AS "id",
        "role",
        true AS "is_new",
        ${type} :: "package_type" AS "type",
        'active' :: "package_status" AS "status",
        ${visibility} :: "package_visibility" AS "visibility",
        false AS "versionExists"
      from
        insert_access
      union all
      select
        p."id",
        pa."role",
        false AS "is_new",
        p."type",
        p."status",
        p."visibility",
        exists (
          select 1
          from "package_version" pv
          where pv."package_id" = p."id"
            and pv."version" = ${version}
        ) AS "versionExists"
      from
        "package" p
        left join "package_access" pa on p."id" = pa."package_id"
        and pa."user_id" = ${userId}
      where
        p."name" = ${name}
        and not exists (
          select
            1
          from
            insert_package
        )
    `;

    if (!row) {
      // This should never happen. If it does, it indicates a Postgres MVCC snapshot race
      // condition where two users tried to create the same package at the exact same millisecond.
      //
      // This query MUST be executed inside an application-level lock on the package name to
      // guarantee serial execution. We throw here defensively in case the lock implementation
      // is buggy, expired early, or the package was manually deleted mid-transaction.
      throw new Error(`Failed to resolve package state for ${name}.`);
    }

    return row;
  }
}
