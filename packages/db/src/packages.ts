import type { Package } from '@wpm/manifest';
import type { Role as PackageRole } from '@wpm/rbac';
import type { PackageStatus, PackageId, UserId, PackageType } from '@wpm/types';

import { Base } from './base';

export type PackageAccess = {
  id: PackageId;
  type: PackageType;
  role: PackageRole | null;
  status: PackageStatus;
  visibility: Package['visibility'];
};

export type PublishState = PackageAccess & {
  versionExists: boolean;
};

export type PublishCommitResult = {
  created: boolean;
  committed: boolean;
};

export type Dependent = {
  id: PackageId;
  name: string;
};

export type DependentsPage = {
  dependents: Dependent[];
  cursor: PackageId | null;
};

const DEPENDENTS_PAGE_SIZE = 25;

export class Packages extends Base {
  async getAccess(name: string, userId: UserId) {
    return this.cached<PackageAccess>(
      `pkg:access:${name}:${userId}`,
      async () => {
        const [row] = await this.db<[PackageAccess?]>`
          select p.id, p.type, p.status, p.visibility, pa.role
          from "package" p
          left join "package_access" pa
            on p.id = pa.package_id and pa.user_id = ${userId}
          where p.name = ${name}
        `;

        return row ?? null;
      },
      { ttl: 604800, cacheNull: true },
    );
  }

  async getDependents(depName: string, after: PackageId | null): Promise<DependentsPage> {
    const page = await this.cached<DependentsPage>(
      `pkg:dependents:${depName}:${after ?? 0}`,
      async () => {
        const rows = await this.db<Dependent[]>`
          select p."id", p."name"
          from (
            select "package_id"
            from "package_dependent"
            where "dep_name" = ${depName} and "package_id" > ${after ?? 0}
            order by "package_id"
            limit ${DEPENDENTS_PAGE_SIZE + 1}
          ) d
          join "package" p on p."id" = d."package_id"
          order by p."id"
        `;

        const hasMore = rows.length > DEPENDENTS_PAGE_SIZE;
        const dependents = hasMore ? rows.slice(0, DEPENDENTS_PAGE_SIZE) : [...rows];

        return {
          dependents,
          cursor: hasMore ? dependents[dependents.length - 1].id : null,
        };
      },
      { ttl: 604800 },
    );

    return page ?? { dependents: [], cursor: null };
  }

  async countDependents(depName: string): Promise<number> {
    const count = await this.cached<number>(
      `pkg:dependents:count:${depName}`,
      async () => {
        const [row] = await this.db<[{ count: number }]>`
          select count(*)::int as "count"
          from "package_dependent"
          where "dep_name" = ${depName}
        `;

        return row.count;
      },
      { ttl: 604800 },
    );

    return count ?? 0;
  }

  async versionExists(packageId: PackageId, version: string): Promise<boolean> {
    const [row] = await this.db<[{ exists: boolean }]>`
      select exists (
        select 1
        from "package_version"
        where "package_id" = ${packageId} and "version" = ${version}
      ) as "exists"
    `;

    return row.exists;
  }

  async getPublishState(
    name: string,
    version: string,
    userId: UserId,
  ): Promise<PublishState | null> {
    const [row] = await this.db<[PublishState?]>`
      select
        p.id, p.type, p.status, p.visibility, pa.role,
        exists (
          select 1
          from "package_version" pv
          where pv.package_id = p.id and pv.version = ${version}
        ) as "versionExists"
      from "package" p
      left join "package_access" pa
        on p.id = pa.package_id and pa.user_id = ${userId}
      where p.name = ${name}
    `;

    return row ?? null;
  }

  async insertVersion(
    manifest: Package,
    userId: UserId,
    packageId: PackageId,
  ): Promise<PublishCommitResult> {
    const sql = this.db;

    const [row] = await sql<[{ committed: boolean }]>`
      with ins_ver as (
        insert into
          "package_version" (
            "description",
            "version",
            "requires",
            "license",
            "homepage",
            "tags",
            "author",
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
            (
              select array_agg(t.v)
              from jsonb_array_elements_text(${manifest.tags ? sql.json(manifest.tags) : null}) as t (v)
            ),
            ${manifest.author ?? null},
            ${manifest.dependencies ? sql.json(manifest.dependencies) : null},
            ${manifest.devDependencies ? sql.json(manifest.devDependencies) : null},
            ${userId},
            ${sql.json(manifest.dist)},
            ${manifest._wpm},
            ${packageId}
          )
        on conflict ("package_id", "version") do nothing
        returning "package_id", "version"
      ),
      ins_tag as (
        insert into
          "package_dist_tag" ("tag", "package_id", "version")
        select
          ${manifest.tag}, "package_id", "version"
        from
          ins_ver
        on conflict ("tag", "package_id") do update
        set
          "version" = excluded."version"
      ),
      del_deps as (
        delete from "package_dependent" pd
        using ins_ver v
        where
          ${manifest.tag === 'latest'}
          and pd."package_id" = v."package_id"
          and not exists (
            select 1
            from jsonb_each_text(${manifest.dependencies ? sql.json(manifest.dependencies) : null}) as d
            where d.key = pd."dep_name"
          )
      ),
      ins_deps as (
        insert into
          "package_dependent" as pd ("dep_name", "package_id", "dep_range")
        select
          d.key, v."package_id", d.value
        from
          ins_ver v,
          jsonb_each_text(${manifest.dependencies ? sql.json(manifest.dependencies) : null}) as d
        where
          ${manifest.tag === 'latest'}
        on conflict ("dep_name", "package_id") do update
        set
          "dep_range" = excluded."dep_range"
        where
          pd."dep_range" is distinct from excluded."dep_range"
      )
      select
        exists (select 1 from ins_ver) as "committed"
    `;

    return { committed: row.committed, created: false };
  }

  async createWithVersion(manifest: Package, userId: UserId): Promise<PublishCommitResult> {
    const sql = this.db;

    const [row] = await sql<[{ committed: boolean; created: boolean }]>`
      with ins_pkg as (
        insert into
          "package" ("name", "type", "status", "visibility")
        values
          (${manifest.name}, ${manifest.type}, 'active', ${manifest.visibility})
        on conflict ("name") do nothing
        returning "id"
      ),
      ins_access as (
        insert into
          "package_access" ("package_id", "user_id", "role", "added_by")
        select
          "id", ${userId}, 'admin' :: "package_role", ${userId}
        from
          ins_pkg
      ),
      ins_ver as (
        insert into
          "package_version" (
            "description",
            "version",
            "requires",
            "license",
            "homepage",
            "tags",
            "author",
            "dependencies",
            "devDependencies",
            "released_by",
            "dist",
            "_wpm",
            "package_id"
          )
        select
          ${manifest.description ?? null},
          ${manifest.version},
          ${manifest.requires ? sql.json(manifest.requires) : null},
          ${manifest.license ?? null},
          ${manifest.homepage ?? null},
          (
            select array_agg(t.v)
            from jsonb_array_elements_text(${manifest.tags ? sql.json(manifest.tags) : null}) as t (v)
          ),
          ${manifest.author ?? null},
          ${manifest.dependencies ? sql.json(manifest.dependencies) : null},
          ${manifest.devDependencies ? sql.json(manifest.devDependencies) : null},
          ${userId},
          ${sql.json(manifest.dist)},
          ${manifest._wpm},
          "id"
        from
          ins_pkg
        returning "package_id", "version"
      ),
      ins_tag as (
        insert into
          "package_dist_tag" ("tag", "package_id", "version")
        select
          ${manifest.tag}, "package_id", "version"
        from
          ins_ver
        on conflict ("tag", "package_id") do update
        set
          "version" = excluded."version"
      ),
      ins_deps as (
        insert into
          "package_dependent" ("dep_name", "package_id", "dep_range")
        select
          d.key, v."package_id", d.value
        from
          ins_ver v,
          jsonb_each_text(${manifest.dependencies ? sql.json(manifest.dependencies) : null}) as d
        where
          ${manifest.tag === 'latest'}
      )
      select
        exists (select 1 from ins_pkg) as "created",
        exists (select 1 from ins_ver) as "committed"
    `;

    if (row.created) {
      await this.invalidate(`pkg:access:${manifest.name}:${userId}`).catch(() => {});
    }

    return row;
  }
}
