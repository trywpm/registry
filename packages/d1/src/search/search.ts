import { Buffer } from 'node:buffer';

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

export type PackageOptions = {
  type: Type;
  limit: number;
  sort: AllowedSorts;
};

export type ListOptions = PackageOptions & {
  page: number;
};

export type SearchOptions = PackageOptions & {
  q: string;
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
    type: 'plugin',
    sort: 'popularity',
    ...opts,
  };

  const cleanQuery = options.q.trim();
  if (!cleanQuery) {
    return getPackages(d1, reqUrl, ctx, {
      page: 1,
      type: options.type,
      sort: options.sort,
      limit: options.limit,
    });
  }

  const cacheKey = new Request(
    `${reqUrl.origin}/${CACHE_KEY_PREFIX}/search/${options.type}?q=${encodeURIComponent(cleanQuery)}&cursor=${options.cursor ? encodeURIComponent(options.cursor) : ''}&sort=${options.sort}&limit=${options.limit}`,
  );
  const cache = await caches.open(`d1-search-cache-${CACHE_VERSION}`);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json<D1ResultWithNext<SearchPackageRow>>();
  }

  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  let sql = '';

  const binds: (string | number)[] = [];
  const ftsQuery = prepareFtsQuery(cleanQuery);

  sql = `
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
            END) (bm25(packages_fts, 10.0, 2.0, 5.0) * -1) +
             (p.quality_score * 0.5)
          ) as score
        FROM packages_fts
        JOIN packages p ON packages_fts.rowid = p.id
        WHERE packages_fts MATCH ? AND p.type = ?
      )
      SELECT * FROM RankedPackages
      WHERE 1=1
    `;
  binds.push(cleanQuery, cleanQuery, cleanQuery, cleanQuery, ftsQuery, options.type);

  if (cursor) {
    switch (options.sort) {
      case 'newest':
        sql += ` AND (package_published < ? OR (package_published = ? AND id < ?))`;
        binds.push(cursor.value, cursor.value, cursor.id);
        break;
      case 'name':
        sql += ` AND (name > ? OR (name = ? AND id > ?))`;
        binds.push(cursor.value, cursor.value, cursor.id);
        break;
      case 'popularity':
      default:
        sql += ` AND (score < ? OR (score = ? AND id < ?))`;
        binds.push(cursor.value, cursor.value, cursor.id);
        break;
    }
  }

  switch (options.sort) {
    case 'newest':
      sql += ` ORDER BY package_published DESC, id DESC`;
      break;
    case 'name':
      sql += ` ORDER BY name ASC, id ASC`;
      break;
    case 'popularity':
    default:
      sql += ` ORDER BY score DESC, id DESC`;
      break;
  }

  sql += ` LIMIT ?`;
  binds.push(options.limit + 1); // Fetch one extra to determine if there's a next page

  const rawResults = await d1
    .prepare(sql)
    .bind(...binds)
    .all<RawPackageRow>();

  const fetchedRows = rawResults.results;

  let nextCursor: string | null = null;

  if (fetchedRows.length > options.limit) {
    const lastRow = fetchedRows[options.limit - 1];

    let cursorValue: string | number;
    if (options.sort === 'newest') {
      cursorValue = lastRow.package_published;
    } else if (options.sort === 'name') {
      cursorValue = lastRow.name;
    } else {
      cursorValue = lastRow.score;
    }

    nextCursor = encodeCursor(cursorValue, lastRow.id);

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
