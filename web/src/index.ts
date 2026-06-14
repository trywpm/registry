import { Hono } from 'hono';
import { Registry } from '@wpm/db';
import { trimTrailingSlash } from 'hono/trailing-slash';

import { NotFound } from '@/pages/404';
import { ServerError } from '@/pages/500';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono<AppEnv>({ strict: true });

app.use('*', trimTrailingSlash({ alwaysRedirect: true }));
app.use('*', async (c, next) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
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
    `script-src 'nonce-${nonce}' 'self' ${import.meta.env.VITE_CLERK_DOMAIN} https://challenges.cloudflare.com`,
  ].join('; ');

  c.set('cspNonce', nonce);
  c.header('Content-Security-Policy', csp);

  // DB repos instance.
  c.set('repos', new Registry(c.env.cache, c.env.pg.connectionString));

  await next();
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
