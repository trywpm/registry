import { Hono } from 'hono';

import { NotFound } from '@/pages/404';
import { ServerError } from '@/pages/500';

import homeRoute from '@/routes/home';
import packageRoute from '@/routes/package';

const app = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: {
    cspNonce: string;
  };
}>();

app.use('*', async (c, next) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    `base-uri 'self'`,
    `default-src 'none'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `form-action 'self'`,
    `font-src 'self' https:`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: https:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'self' 'unsafe-inline'`,
    `frame-src 'self' https://www.youtube-nocookie.com https://videopress.com`,
  ].join('; ');

  c.set('cspNonce', nonce);
  c.header('Content-Security-Policy', csp);

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
