import { Hono } from 'hono';

const packageRoute = new Hono<AppEnv>();

packageRoute.get('/:name', async (c) => (await import('@/pages/package')).PackagePage(c));
packageRoute.get('/:name/versions', async (c) =>
  (await import('@/pages/package/versions')).VersionsPage(c),
);
packageRoute.get('/:name/dependencies', async (c) =>
  (await import('@/pages/package/dependencies')).DependenciesPage(c),
);

export default packageRoute;
