import { Hono } from 'hono';
import { Registry } from '@wpm/db';

import { cspWithNonce } from '@/lib/csp';
import { NotFound } from '@/pages/404';
import { ServerError } from '@/pages/500';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono<AppEnv>({ strict: true });

app.use('*', async (c, next) => {
  if (
    (c.req.method === 'GET' || c.req.method === 'HEAD') &&
    c.req.path !== '/' &&
    c.req.path.at(-1) === '/'
  ) {
    const u = c.req.url;
    let cut = u.indexOf('?');
    const hash = u.indexOf('#');
    if (cut === -1 || (hash !== -1 && hash < cut)) {
      cut = hash;
    }
    const target = cut === -1 ? u.slice(0, -1) : u.slice(0, cut - 1) + u.slice(cut);
    return c.redirect(target, 301);
  }

  const nonce = crypto.randomUUID();

  c.set('cspNonce', nonce);
  c.header('Content-Security-Policy', cspWithNonce(nonce));

  // DB repos instance.
  c.set('repos', new Registry(c.env.cache, c.env.pg.connectionString));

  return next();
});

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
