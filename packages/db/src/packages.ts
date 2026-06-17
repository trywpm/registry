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

export type ManifestMeta = {
  t: PackageType;
  v: Package['visibility'];
  lm: string; // pre-formatted last-modified.
};

export type TagResult = {
  version: string;
  visibility: Package['visibility'];
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
  getAccess(name: string, userId: UserId) {
    return this.cached<PackageAccess>(
      `pkg:access:${name}:${userId}`,
      async () => {
        const sql = await this.sql();
        const [row] = await sql<[PackageAccess?]>`
          select p.id, p.type, p.status, p.visibility, pa.role
          from "package" p
          left join "package_access" pa
            on p.id = pa.package_id and pa.user_id = ${userId}
          where p.name = ${name}
        `;

        return row ?? null;
      },
      { ttl: 604800, cacheNull: true, cacheTtl: 60 },
    );
  }

  getManifest(name: string, version: string) {
    return this.cachedBody<ManifestMeta>(
      `pkg:manifest:${name}:${version}`,
      async () => {
        const sql = await this.sql();
        const [row] = await sql<
          [
            {
              visibility: Package['visibility'];
              name: string;
              type: PackageType;
              version: string;
              created: Date;
              modified: Date;
              description: string | null;
              tags: string[] | null;
              license: string | null;
              homepage: string | null;
              author: string | null;
              requires: Package['requires'] | null;
              dependencies: Package['dependencies'] | null;
              dist: Package['dist'];
              _wpm: string;
            }?,
          ]
        >`
          select
            p."visibility",
            p."name",
            p."type",
            pv."version",
            pv."created",
            pv."modified",
            pv."description",
            to_jsonb(pv."tags") as "tags",
            pv."license",
            pv."homepage",
            pv."author",
            pv."requires",
            pv."dependencies",
            pv."dist",
            pv."_wpm"
          from "package_version" pv
          join "package" p on p."id" = pv."package_id"
          where p."name" = ${name} and pv."version" = ${version} and p."status" != 'deleted'
        `;

        if (!row) {
          return null;
        }

        return {
          value: JSON.stringify({
            name: row.name,
            type: row.type,
            version: row.version,
            description: row.description ?? undefined,
            tags: row.tags ?? undefined,
            license: row.license ?? undefined,
            homepage: row.homepage ?? undefined,
            author: row.author ?? undefined,
            requires: row.requires ?? undefined,
            dependencies: row.dependencies ?? undefined,
            dist: row.dist,
            _wpm: row._wpm,
            created: row.created,
          }),
          metadata: { v: row.visibility, lm: new Date(row.modified).toUTCString(), t: row.type },
        };
      },
      { ttl: 604800, cacheNull: true, cacheTtl: 600 },
    );
  }

  getPackageDocument(name: string) {
    return this.cachedBody<{ v: Package['visibility']; t: PackageType }>(
      `pkg:doc:${name}`,
      async () => {
        const sql = await this.sql();
        const [row] = await sql<
          [{ visibility: Package['visibility']; type: PackageType; body: string }?]
        >`
          select
            p."visibility",
            p."type",
            json_build_object(
              'name', p."name",
              'dist-tags', coalesce(
                (
                  select json_object_agg(pdt."tag", pdt."version")
                  from "package_dist_tag" pdt
                  where pdt."package_id" = p."id"
                ),
                '{}'::json
              ),
              'versions', coalesce(
                (
                  select json_object_agg(
                    pv."version",
                    coalesce(pv."requires", '{}'::jsonb)
                    order by pv."created" desc
                  )
                  from "package_version" pv
                  where pv."package_id" = p."id"
                ),
                '{}'::json
              ),
              'created', p."created",
              'modified', p."modified"
            )::text as "body"
          from "package" p
          where p."name" = ${name} and p."status" != 'deleted'
        `;

        return row ? { value: row.body, metadata: { v: row.visibility, t: row.type } } : null;
      },
      { ttl: 86400, cacheNull: true, cacheTtl: 300 },
    );
  }

  async getTagVersion(name: string, tag: string): Promise<TagResult | null> {
    const hit = await this.cachedBody<{ v: Package['visibility'] }>(
      `pkg:tag:${name}:${tag}`,
      async () => {
        const sql = await this.sql();
        const [row] = await sql<[TagResult?]>`
          select p."visibility", pdt."version"
          from "package_dist_tag" pdt
          join "package" p on p."id" = pdt."package_id"
          where p."name" = ${name} and pdt."tag" = ${tag} and p."status" != 'deleted'
        `;

        return row ? { value: row.version, metadata: { v: row.visibility } } : null;
      },
      { ttl: 86400, cacheNull: true, cacheTtl: 60 },
    );

    return hit && { version: hit.value, visibility: hit.metadata.v };
  }

  async getDependents(depName: string, after: PackageId | null): Promise<DependentsPage> {
    const page = await this.cached<DependentsPage>(
      `pkg:dependents:${depName}:${after ?? 0}`,
      async () => {
        const sql = await this.sql();
        const rows = await sql<Dependent[]>`
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
      { ttl: 604800, cacheTtl: 600 },
    );

    return page ?? { dependents: [], cursor: null };
  }

  async countDependents(depName: string): Promise<number> {
    const count = await this.cached<number>(
      `pkg:dependents:count:${depName}`,
      async () => {
        const sql = await this.sql();
        const [row] = await sql<[{ count: number }]>`
          select count(*)::int as "count"
          from "package_dependent"
          where "dep_name" = ${depName}
        `;

        return row.count;
      },
      { ttl: 604800, cacheTtl: 600 },
    );

    return count ?? 0;
  }

  async getPublishState(
    name: string,
    version: string,
    userId: UserId,
  ): Promise<PublishState | null> {
    const sql = await this.sql();
    const [row] = await sql<[PublishState?]>`
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
    const sql = await this.sql();

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

    if (row.committed) {
      await this.invalidate([
        `pkg:tag:${manifest.name}:${manifest.tag}`,
        `pkg:doc:${manifest.name}`,
      ]).catch(() => {});
    }

    return { committed: row.committed, created: false };
  }

  async createWithVersion(manifest: Package, userId: UserId): Promise<PublishCommitResult> {
    const sql = await this.sql();

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
          t."tag", v."package_id", v."version"
        from
          ins_ver v
          cross join (select distinct unnest(array['latest', ${manifest.tag}]::text[]) as "tag") t
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

    if (row.committed) {
      await this.invalidate([
        `pkg:tag:${manifest.name}:${manifest.tag}`,
        `pkg:doc:${manifest.name}`,
      ]).catch(() => {});
    }

    return row;
  }

  async setDistTag(
    name: string,
    packageId: PackageId,
    tag: string,
    version: string,
  ): Promise<boolean> {
    const sql = await this.sql();
    const [row] = await sql<[{ package_id: PackageId }?]>`
      insert into "package_dist_tag" ("tag", "package_id", "version")
      select ${tag}, ${packageId}, ${version}
      from "package_version" pv
      where pv."package_id" = ${packageId} and pv."version" = ${version}
      on conflict ("tag", "package_id") do update set "version" = excluded."version"
      returning "package_id"
    `;

    if (!row) {
      return false;
    }

    await this.invalidate([`pkg:tag:${name}:${tag}`, `pkg:doc:${name}`]).catch(() => {});

    return true;
  }

  async removeDistTag(name: string, packageId: PackageId, tag: string): Promise<boolean> {
    const sql = await this.sql();
    const [row] = await sql<[{ tag: string }?]>`
      delete from "package_dist_tag"
      where "package_id" = ${packageId} and "tag" = ${tag} and "tag" <> 'latest'
      returning "tag"
    `;

    if (!row) {
      return false;
    }

    await this.invalidate([`pkg:tag:${name}:${tag}`, `pkg:doc:${name}`]).catch(() => {});

    return true;
  }
}
