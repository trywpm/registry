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

export function buildQuery(
  d1: D1DatabaseSession,
  options: SearchOptions = {
    page: 1,
    type: 'plugin',
    pageSize: 10,
    sort: 'popularity',
  },
) {
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

  return d1.prepare(sql).bind(options.type, options.pageSize, offset);
}
