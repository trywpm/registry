import { Hono } from 'hono';

import homeRoute from '@/routes/home';

const app = new Hono();

app.route('/', homeRoute);

export default {
  fetch: app.fetch,
};
