import { Hono } from 'hono';
import { Registry } from '@wpm/db';

import { NotFound } from '@/pages/404';
import { ServerError } from '@/pages/500';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono<AppEnv>({ strict: true });

const CSP_PREFIX = `${[
  `base-uri 'self'`,
  `default-src 'none'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `font-src 'self' https:`,
  `frame-ancestors 'none'`,
  `worker-src 'self' blob:`,
  `img-src 'self' data: https:`,
  `style-src 'self' 'unsafe-inline'`,
  `connect-src 'self' ${import.meta.env.VITE_CLERK_DOMAIN}`,
  `frame-src 'self' https://www.youtube-nocookie.com https://videopress.com https://challenges.cloudflare.com`,
].join('; ')}; script-src 'nonce-`;
const CSP_SUFFIX = `' 'self' ${import.meta.env.VITE_CLERK_DOMAIN} https://challenges.cloudflare.com`;

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
  c.header('Content-Security-Policy', CSP_PREFIX + nonce + CSP_SUFFIX);

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
