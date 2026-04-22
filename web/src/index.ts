import { Hono } from 'hono';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono();

app.notFound((c) => {
  return c.text('Not Found', 404);
});

app.route('/', homeRoute);
app.route('/package', packageRoute);

export default {
  fetch: app.fetch,
};
