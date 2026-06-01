import type { Sql } from 'postgres';
import type { UserWithToken } from '@wpm/db';

import { Hono } from 'hono';
import postgres from 'postgres';
import { Registry } from '@wpm/db';
import { Presigner } from '@wpm/storage';
import { IPCidrMatcher } from '@wpm/net';
import { getAuthTokenHash, parseBearerToken } from '@wpm/auth';
import { isValidPackageName, isValidSemver, PackageSchema } from '@wpm/manifest';

import { MAX_UPLOAD_SIZE, PackageStreamReader } from '@/lib/package-stream-reader';

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

app.put('/:package/:version', async (c) => {
  if (!c.req.raw.body) {
    return c.json({ error: 'missing request body' }, 400);
  }

  const { package: name, version } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'invalid package name' }, 400);
  }

  if (!isValidSemver(version)) {
    return c.json({ error: 'invalid semver version' }, 400);
  }

  const contentLengthHeader = c.req.header('Content-Length');
  if (!contentLengthHeader) {
    return c.json({ error: 'missing content length header' }, 411);
  }

  const contentLength = parseInt(contentLengthHeader, 10);
  if (isNaN(contentLength) || contentLength <= 0) {
    return c.json({ error: 'invalid content length header' }, 400);
  }

  if (contentLength > MAX_UPLOAD_SIZE) {
    return c.json({ error: 'payload too large' }, 413);
  }

  const reader = new PackageStreamReader(c.req.raw.body);

  let manifest;
  try {
    manifest = await reader.getManifest();
  } catch {
    return c.json({ error: 'bad request' }, 400);
  }

  const parsedManifest = await PackageSchema.safeParseAsync(manifest);
  if (!parsedManifest.success) {
    const firstIssue = parsedManifest.error.issues[0];
    return c.json({ error: firstIssue.message }, 400);
  }

  if (parsedManifest.data.name !== name || parsedManifest.data.version !== version) {
    return c.json({ error: 'bad request' }, 400);
  }

  try {
    const stub = c.env.publish.getByName(`${name}@${version}`);
    const tarballStream = reader.getTarballStream();

    return stub.publish(parsedManifest.data, tarballStream, {
      userId: '',
      packageId: '',
    });
  } catch {
    return c.json({ error: 'internal server error' }, 500);
  }
});

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

// Durable Objects.
export { Publish } from '@/publish';
