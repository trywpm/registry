import { Hono } from 'hono';

import { PackagePage } from '@/views/pages/package';

const packageRoute = new Hono();

packageRoute.get('/:name', (c) => {
  return PackagePage(c);
});

export default packageRoute;
