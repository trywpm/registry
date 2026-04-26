// order of keys matters here since it can be used in UI dropdowns.
export const allowedSorts = {
  popularity: 'Most Popular',
  newest: 'Recently Updated',
  name: 'Name (A-Z)',
} as const;

export type Type = 'plugin' | 'theme';
export type AllowedSorts = keyof typeof allowedSorts;

export type SearchOptions = {
  type: Type;
  page: number;
  pageSize: number;
  sort: AllowedSorts;
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
};

export type PackageRow = Omit<RawPackageRow, 'tags'> & {
  tags: string[];
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
  options: SearchOptions = {
    page: 1,
    type: 'plugin',
    pageSize: 10,
    sort: 'popularity',
  },
) {
  const cacheKey = new Request(
    `${reqUrl.origin}/__d1_internal-cache/${options.type}?page=${options.page}&pageSize=${options.pageSize}&sort=${options.sort}`,
  );

  const cache = await caches.open('d1-search-cache-v1');

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse.json<D1Result<PackageRow>>();
  }

  const safePage = Math.max(1, options.page);
  const offset = (safePage - 1) * options.pageSize;

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
    .bind(options.type, options.pageSize, offset)
    .all<RawPackageRow>();

  const parsedResult: PackageRow[] = rawResults.results.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));

  const finalResult: D1Result<PackageRow> = {
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
