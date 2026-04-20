export const allowedSorts = {
  popularity: 'Most Popular',
  newest: 'Recently Updated',
  name: 'Name (A-Z)',
} as const;

export function buildPackagesQuery(
  d1: D1DatabaseSession,
  type: string,
  page: number,
  sort: keyof typeof allowedSorts,
): D1PreparedStatement {
  const limit = 12;
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * limit;

  let innerOrderBy = '';
  let outerOrderBy = '';

  switch (sort) {
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

  return d1.prepare(sql).bind(...[type, limit, offset]);
}
