import { Buffer } from 'node:buffer';

import type { Package } from '@wpm/manifest';

const CACHE_VERSION = 'v1';
const CACHE_KEY_PREFIX = '__d1_internal-cache';

// order of keys matters here since it can be used in UI dropdowns.
export const allowedSorts = {
  popularity: 'Most Popular',
  newest: 'Recently Updated',
  name: 'Name (A-Z)',
} as const;

export type Type = 'plugin' | 'theme';
export type AllowedSorts = keyof typeof allowedSorts;

export type ListOptions = {
  type: Type;
  page: number;
  limit: number;
  sort: AllowedSorts;
};

export type SearchOptions = {
  q: string;
  type?: Type;
  limit: number;
  cursor?: string;
};

type RawPackageRow = {
  id: number;
  name: string;
  type: Type;
  version: string;
  description: string | null;
  tags: string;
  license: string | null;
  package_published: string;
  downloads: number;
  score: number;
  highlight?: string | null;
};

export type ListPackageRow = Omit<RawPackageRow, 'tags'> & {
  tags: string[];
};

export type SearchPackageRow = Omit<RawPackageRow, 'tags'> & {
  tags: string[];
  highlight?: string | null;
};

export function isAllowedSort(value: string | undefined | null): value is AllowedSorts {
  return typeof value === 'string' && value in allowedSorts;
}

export function isType(value: string | undefined | null): value is Type {
  return value === 'plugin' || value === 'theme';
}

export async function getPackages(
  d1: D1DatabaseSession,
  reqUrl: URL,
  ctx: {
    waitUntil: (promise: Promise<unknown>) => void;
  },
  opts: Partial<ListOptions>,
) {
  const options: ListOptions = {
    page: 1,
    limit: 10,
    type: 'plugin',
    sort: 'popularity',
    ...opts,
  };

  const cacheKey = new Request(
    `${reqUrl.origin}/${CACHE_KEY_PREFIX}/${options.type}?page=${options.page}&pageSize=${options.limit}&sort=${options.sort}`,
  );

  const cache = await caches.open(`d1-search-cache-${CACHE_VERSION}`);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json<D1Result<ListPackageRow>>();
  }

  const safePage = Math.max(1, options.page);
  const offset = (safePage - 1) * options.limit;

  let innerOrderBy: string = '';
  let outerOrderBy: string = '';

  switch (options.sort) {
    case 'newest':
      innerOrderBy = `ORDER BY package_published DESC, id DESC`;
      outerOrderBy = `ORDER BY p.package_published DESC, p.id DESC`;
      break;
    case 'name':
      innerOrderBy = `ORDER BY name ASC, id ASC`;
      outerOrderBy = `ORDER BY p.name ASC, p.id ASC`;
      break;
    case 'popularity':
    default:
      innerOrderBy = `ORDER BY quality_score DESC, id DESC`;
      outerOrderBy = `ORDER BY p.quality_score DESC, p.id DESC`;
      break;
  }

  const sql = `
      SELECT
        p.id, p.name, p.type, p.version, p.description, p.tags,
        p.license, p.package_published, p.downloads_per_week AS downloads,
        quality_score as score
      FROM packages p
      INNER JOIN (
        SELECT id
        FROM packages
        WHERE type = ?
        ${innerOrderBy}
        LIMIT ? OFFSET ?
      ) as sub ON p.id = sub.id
      ${outerOrderBy}
    `;

  const rawResults = await d1
    .prepare(sql)
    .bind(options.type, options.limit, offset)
    .all<RawPackageRow>();

  const parsedResult: ListPackageRow[] = rawResults.results.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));

  const finalResult: D1Result<ListPackageRow> = {
    ...rawResults,
    results: parsedResult,
  };

  const response = Response.json(finalResult, {
    headers: {
      'Cache-Tag': `d1-search-results`,
      'Cache-Control': 'public, max-age=86400', // Cache for 1 day
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response));

  return finalResult;
}

export async function getPackagesCount(
  d1: D1DatabaseSession,
  cache: KVNamespace,
  ctx: {
    waitUntil: (promise: Promise<unknown>) => void;
  },
  type: Type,
) {
  const cacheKey = `d1-search:packages:count:${type}`;

  const cachedCount = await cache.get(cacheKey);
  if (cachedCount != null) {
    return Number(cachedCount);
  }

  const sql = `SELECT COUNT(*) as count FROM packages WHERE type = ?`;
  const result = await d1.prepare(sql).bind(type).first<{ count: number }>();
  if (!result) {
    throw new Error('Failed to fetch packages count');
  }

  ctx.waitUntil(cache.put(cacheKey, String(result.count), { expirationTtl: 86400 })); // Cache for 1 day

  return result.count;
}

function prepareFtsQuery(q: string): string {
  const clean = q.replaceAll(/["'*():]/g, ' ').trim();
  if (!clean) {
    return '""';
  }

  return clean
    .split(/\s+/)
    .map((word) => `"${word}"`)
    .join(' ');
}

function encodeCursor(value: string | number, id: number) {
  const str = JSON.stringify({ v: value, i: id });
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function decodeCursor(cursor: string) {
  try {
    const decodedStr = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decodedStr);
    return { value: parsed.v, id: Number(parsed.i) };
  } catch {
    return null;
  }
}

export type D1ResultWithNext<T> = D1Result<T> & {
  nextCursor?: string | null;
};

export async function searchPackages(
  d1: D1DatabaseSession,
  reqUrl: URL,
  ctx: {
    waitUntil: (promise: Promise<unknown>) => void;
  },
  opts: Partial<SearchOptions> & { q: string },
): Promise<D1ResultWithNext<SearchPackageRow>> {
  const options: SearchOptions = {
    limit: 15,
    ...opts,
  };

  const cleanQuery = options.q.trim();
  if (!cleanQuery) {
    throw new Error('Query cannot be empty');
  }

  const cacheKey = new Request(
    `${reqUrl.origin}/${CACHE_KEY_PREFIX}/search/${options.type}?q=${encodeURIComponent(cleanQuery)}&cursor=${options.cursor ? encodeURIComponent(options.cursor) : ''}&limit=${options.limit}`,
  );
  const cache = await caches.open(`d1-search-cache-${CACHE_VERSION}`);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json<D1ResultWithNext<SearchPackageRow>>();
  }

  const binds: (string | number)[] = [];
  const ftsQuery = prepareFtsQuery(cleanQuery);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  let typeFilter = '';
  if (options.type) {
    typeFilter = ' AND packages_fts.type = ?';
  }

  let sql = `
      WITH RankedPackages AS (
        SELECT
          p.id, p.name, p.type, p.version, p.description, p.tags,
          p.license, p.package_published, p.downloads_per_week AS downloads,
          snippet(packages_fts, 1, '<mark>', '</mark>', '...', 10) as highlight,
          (
            (CASE WHEN p.name = ? THEN 100 ELSE 0 END) +
            (CASE
              WHEN p.name LIKE ? || '-%' THEN 20
              WHEN p.name LIKE '%-' || ? THEN 20
              WHEN p.name LIKE '%-' || ? || '-%' THEN 20
              ELSE 0
            END) +
             (bm25(packages_fts, 10.0, 2.0, 5.0) * -1) +
             (p.quality_score * 0.5)
          ) as score
        FROM packages_fts
        JOIN packages p ON packages_fts.rowid = p.id
        WHERE packages_fts MATCH ?${typeFilter}
      )
      SELECT * FROM RankedPackages
      WHERE 1=1
    `;
  binds.push(cleanQuery, cleanQuery, cleanQuery, cleanQuery, ftsQuery);

  if (options.type) {
    binds.push(options.type);
  }

  if (cursor) {
    sql += ` AND (score < ? OR (score = ? AND id < ?))`;
    binds.push(cursor.value, cursor.value, cursor.id);
  }

  sql += ` ORDER BY score DESC, id DESC LIMIT ?`;
  binds.push(options.limit + 1); // Fetch one extra to determine if there's a next page

  const rawResults = await d1
    .prepare(sql)
    .bind(...binds)
    .all<RawPackageRow>();

  const fetchedRows = rawResults.results;

  let nextCursor: string | null = null;

  if (fetchedRows.length > options.limit) {
    const lastRow = fetchedRows[options.limit - 1];

    nextCursor = encodeCursor(lastRow.score, lastRow.id);

    fetchedRows.pop();
  }

  const parsedResult: SearchPackageRow[] = fetchedRows.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));

  const finalResult: D1ResultWithNext<SearchPackageRow> = {
    ...rawResults,
    results: parsedResult,
    nextCursor,
  };

  const response = Response.json(finalResult, {
    headers: {
      'Cache-Tag': 'd1-search-results',
      'Cache-Control': 'public, max-age=86400',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response));

  return finalResult;
}

export async function updateSearchIndex(d1: D1Database, manifest: Package) {
  if (manifest.visibility !== 'public' || manifest.tag !== 'latest') {
    return;
  }

  const queries = [];
  const now = new Date().toISOString();
  const deps = Object.keys(manifest.dependencies ?? {});
  const tagsJson = JSON.stringify(manifest.tags ?? []);

  queries.push(
    d1
      .prepare(
        `INSERT INTO packages (name, type, version, description, tags, license, package_published)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            type=excluded.type,
            version=excluded.version,
            description=excluded.description,
            tags=excluded.tags,
            license=excluded.license,
            package_published=excluded.package_published
          WHERE excluded.version IS NOT packages.version
            OR excluded.type IS NOT packages.type
            OR excluded.description IS NOT packages.description
            OR excluded.tags IS NOT packages.tags
            OR excluded.license IS NOT packages.license`,
      )
      .bind(
        manifest.name,
        manifest.type,
        manifest.version,
        manifest.description || null,
        tagsJson,
        manifest.license || null,
        now,
      ),
  );

  if (deps.length > 0) {
    const inPlaceholders = deps.map(() => '?').join(', ');

    queries.push(
      d1
        .prepare(
          `DELETE FROM package_dependencies WHERE source_name = ? AND target_name NOT IN (${inPlaceholders})`,
        )
        .bind(manifest.name, ...deps),
    );

    const placeholders = deps.map(() => '(?, ?)').join(', ');
    const inputs = deps.flatMap((dep) => [manifest.name, dep]);

    queries.push(
      d1
        .prepare(
          `INSERT OR IGNORE INTO package_dependencies (source_name, target_name) VALUES ${placeholders}`,
        )
        .bind(...inputs),
    );
  } else {
    queries.push(
      d1.prepare(`DELETE FROM package_dependencies WHERE source_name = ?`).bind(manifest.name),
    );
  }

  await d1.batch(queries);
}
