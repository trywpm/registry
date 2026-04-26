import { Hono } from 'hono';

import { NotFound } from '@/pages/404';
import { ServerError } from '@/pages/500';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: {};
}>();

app.notFound((c) => {
  return NotFound(c);
});

app.onError((err, c) => {
  return ServerError(c, err);
});

app.route('/', homeRoute);
app.route('/package', packageRoute);

export default {
  fetch: app.fetch,
};
