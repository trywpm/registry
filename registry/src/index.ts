import type { Sql } from 'postgres';
import type { UserWithToken } from '@wpm/db';

import { Hono } from 'hono';
import postgres from 'postgres';
import { Registry } from '@wpm/db';
import { Presigner } from '@wpm/storage';
import { IPCidrMatcher } from '@wpm/net';
import { getAuthTokenHash, parseBearerToken } from '@wpm/auth';
import { isValidPackageName, isValidSemver } from '@wpm/manifest';

const app = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: {
    db: () => Sql;
    repos: Registry;
    user?: UserWithToken;
  };
}>();

app.use('*', async (c, next) => {
  let dbInstance: Sql | null = null;

  const getDb = (): Sql => {
    dbInstance ??= postgres(c.env.pg.connectionString, {
      max: 1,
      fetch_types: false,
      idle_timeout: 15,
      connect_timeout: 10,
    });

    return dbInstance;
  };

  c.set('db', getDb);
  c.set('repos', new Registry(getDb, c.env.cache));

  return next();
});

app.use('*', async (c, next) => {
  // Check auth header requirements.
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return next();
  }

  // Validate and parse token.
  const bearerToken = parseBearerToken(authHeader);
  if (!bearerToken) {
    c.header('WWW-Authenticate', `Bearer realm="registry", error="invalid_token"`);
    return c.json({ error: 'bad credentials' }, 401);
  }

  const repos = c.get('repos');
  const tokenHash = await getAuthTokenHash(bearerToken, c.env.PAT_HMAC_KEY);

  // Lookup token in database after hashing.
  const user = await repos.users.getByToken(tokenHash);
  if (!user) {
    c.header('WWW-Authenticate', `Bearer realm="registry", error="invalid_token"`);
    return c.json({ error: 'bad credentials' }, 401);
  }

  // Check user status.
  if (user.status !== 'active') {
    return c.json({ error: 'user account is not active' }, 403);
  }

  if (user.tokenExpiry && new Date(user.tokenExpiry).getTime() < Date.now()) {
    c.header(
      'WWW-Authenticate',
      `Bearer realm="registry", error="invalid_token", error_description="token has expired"`,
    );
    return c.json({ error: 'token has expired' }, 401);
  }

  // Check CIDR restrictions.
  if (user.tokenCidrs && user.tokenCidrs.length > 0) {
    const ip = c.req.header('True-Client-IP');
    if (!ip) {
      return c.json({ error: 'unable to determine client ip' }, 500);
    }

    try {
      const m = new IPCidrMatcher(user.tokenCidrs);
      if (!m.contains(ip)) {
        return c.json({ error: `ip ${ip} not in token allowlist` }, 403);
      }
    } catch {
      return c.json({ error: 'invalid cidr configuration on token' }, 500);
    }
  }

  c.set('user', user);

  return next();
});

app.get('/', (c) => c.json({ name: 'wpm registry', version: '0.1.0' }));

app.get('/-/whoami', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  return c.text(user.username);
});

app.get('/:package', async (c) => {
  const { package: name } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'not found' }, 404);
  }

  const pkg = await c.env.manifest.get(name);
  if (!pkg) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json(pkg);
});

app.get('/:package/:filename', async (c) => {
  const { package: name, filename } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'not found' }, 404);
  }

  if (!filename.endsWith('.tar.zst')) {
    return c.json({ error: 'not found' }, 404);
  }

  const version = filename.replace('.tar.zst', '');
  if (!isValidSemver(version)) {
    return c.json({ error: 'not found' }, 404);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const repos = c.get('repos');

  const access = await repos.packages.getAccess(name, user.userId);
  if (!access || !access.role) {
    return c.json({ error: 'not found' }, 404);
  }

  const p = new Presigner({
    region: c.env.AWS_REGION,
    bucket: c.env.S3_BUCKET,
    endpoint: c.env.AWS_ENDPOINT_URL,
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
  });

  const url = await p.get({
    // This endpoint sits behind a top-level Cloudflare Snippet proxy.
    // Public packages are served directly at the edge and never reach here.
    //
    // If execution reaches this point, we can assume one of two things:
    // 1. The request is for a private package, or
    // 2. The requested file does not exist in the S3 bucket
    //    (for example, request to non-existent or a deleted package).
    //
    // In either case, we generate a signed URL and let the Cloudflare
    // layer handle the final response flow.
    key: `private-packages/${name}/${version}.tar.zst`,
    expiresIn: 3600,
  });

  return c.redirect(url, 302);
});

export default {
  fetch: app.fetch,
};
