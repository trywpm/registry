import { Hono } from 'hono';

import { PackagePage } from '@/pages/package';
import { VersionsPage } from '@/pages/package/versions';
import { DependenciesPage } from '@/pages/package/dependencies';

const packageRoute = new Hono<AppEnv>();

packageRoute.get('/:name', (c) => {
  return PackagePage(c);
});

packageRoute.get('/:name/versions', (c) => {
  return VersionsPage(c);
});

packageRoute.get('/:name/dependencies', (c) => {
  return DependenciesPage(c);
});

export default packageRoute;
