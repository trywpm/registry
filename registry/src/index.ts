import type { Sql } from 'postgres';
import type { UserWithToken } from '@wpm/db';

import { Hono } from 'hono';
import postgres from 'postgres';
import { Registry } from '@wpm/db';
import { Logger } from '@wpm/logger';
import { Presigner } from '@wpm/storage';
import { IPCidrMatcher } from '@wpm/net';
import { UserError } from '@wpm/exception';
import { canToken, canUser } from '@wpm/rbac';
import { getAuthTokenHash, parseBearerToken } from '@wpm/auth';
import { isValidPackageName, isValidSemver, PackageSchema, formatZodError } from '@wpm/manifest';

import { signManifest } from '@/lib/sign-manifest';
import { uploadToStaging, uploadErrorResponse } from '@/lib/tarball';
import { MAX_UPLOAD_SIZE, PackageStreamReader } from '@/lib/package-stream-reader';

const app = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: {
    db: () => Sql;
    repos: Registry;
    user?: UserWithToken;
    logger: Logger;
    requestId: string;
  };
}>();

// #region Bindings Middleware
app.use('*', (c, next) => {
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

  const logger = new Logger(c.env.APP_ENV === 'development' ? 10 : 30, '');
  const requestId = c.req.header('Cf-Ray') ?? crypto.randomUUID();

  c.set('db', getDb);
  c.set('repos', new Registry(getDb, c.env.cache));
  c.set('logger', logger.child({ requestId }));
  c.set('requestId', requestId);

  return next();
});
// #endregion

// #region Authentication Middleware
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
// #endregion

// #region Home Route
app.get('/', (c) => c.json({ name: 'wpm registry', version: '0.1.0' }));
// #endregion

// #region Package Publish Route
app.put('/:package/:version', async (c) => {
  const { package: name, version } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'not found' }, 404);
  }

  if (!isValidSemver(version)) {
    return c.json({ error: 'not found' }, 404);
  }

  if (!c.req.raw.body) {
    return c.json({ error: 'missing request body' }, 400);
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

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'requires authentication' }, 401);
  }

  if (!user.userId) {
    throw new Error('authenticated user is missing userId');
  }
  if (!user.tokenId) {
    throw new Error('authenticated user is missing tokenId');
  }

  if (!canToken(user.tokenScopes, 'publish', 'package')) {
    return c.json({ error: 'missing token scope to publish package' }, 403);
  }

  const reader = new PackageStreamReader(c.req.raw.body);
  const reject = async (error: string, status: 400 | 403 | 404 | 409) => {
    await reader.cancel();
    return c.json({ error }, status);
  };

  const manifest = await reader.getManifest();
  const parsedManifest = await PackageSchema.safeParseAsync(manifest);
  if (!parsedManifest.success) {
    return reject(formatZodError(parsedManifest.error), 400);
  }

  if (parsedManifest.data.name !== name || parsedManifest.data.version !== version) {
    return reject('bad request', 400);
  }

  if (4 + reader.manifestByteLength + parsedManifest.data.dist.packedSize !== contentLength) {
    return reject('content-length does not match the framed payload size', 400);
  }

  const repos = c.get('repos');
  const access = await repos.packages.getAccess(name, user.userId);
  if (access) {
    if (!access.role) {
      return reject('not found', 404);
    }
    if (!canUser(access.role, 'publish', 'package')) {
      return reject('user is not authorized to publish package', 403);
    }
    if (access.status !== 'active') {
      return reject(`${name} is not accepting new versions`, 403);
    }
    if (await repos.packages.versionExists(access.id, version)) {
      return reject(`${name}@${version} already exists`, 409);
    }
    if (access.type !== parsedManifest.data.type) {
      return reject(`package type mismatch, expected ${access.type}`, 400);
    }
    if (access.visibility !== parsedManifest.data.visibility) {
      return reject(`package visibility mismatch, expected ${access.visibility}`, 400);
    }
  }

  const digestSegment = parsedManifest.data.dist.digest
    .slice(7)
    .replaceAll(/[+/]|=+$/g, (m) => (m === '+' ? '-' : m === '/' ? '_' : ''));
  const stagingKey = `staging/${digestSegment}.tar.zst`;

  const alreadyStaged = (await c.env.tarball.head(stagingKey)) != null;
  if (alreadyStaged) {
    await reader.cancel();
  }

  const [sign, upload] = await Promise.allSettled([
    signManifest(c.env, parsedManifest.data),
    alreadyStaged
      ? Promise.resolve()
      : uploadToStaging(c.env, stagingKey, reader.getTarballStream(), parsedManifest.data.dist),
  ]);

  if (upload.status === 'rejected') {
    c.get('logger').warn('tarball upload rejected', { err: upload.reason });
    return uploadErrorResponse(upload.reason, parsedManifest.data.dist);
  }

  if (sign.status === 'rejected') {
    c.get('logger').error('failed to sign manifest', { err: sign.reason });
    return c.json({ error: 'internal server error' }, 500);
  }

  const stub = c.env.publish.getByName(name);
  return stub.publish(parsedManifest.data, stagingKey, {
    userId: user.userId,
    requestId: c.get('requestId'),
  });
});
// #endregion

// #region Whoami Route
app.get('/-/whoami', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  return c.text(user.username);
});
// #endregion

// #region Tarball Download Route
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
    return c.json({ error: 'requires authentication' }, 401);
  }

  if (!user.userId) {
    throw new Error('authenticated user is missing userId');
  }
  if (!user.tokenId) {
    throw new Error('authenticated user is missing tokenId');
  }

  if (!canToken(user.tokenScopes, 'view', 'package')) {
    return c.json({ error: 'missing token scope to access package' }, 403);
  }

  const repos = c.get('repos');
  const access = await repos.packages.getAccess(name, user.userId);
  if (!access || !access.role || access.status === 'deleted') {
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
    key: `${access.visibility}/${name}/${version}.tar.zst`,
    expiresIn: 3600,
  });

  return c.redirect(url, 302);
});
// #endregion

// #region Error Handlers
app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  if (err instanceof UserError) {
    return c.json({ error: err.message }, err.status);
  }

  c.get('logger').error('unhandled error', { err });
  return c.json({ error: 'internal server error' }, 500);
});
// #endregion

// #region Exports
export default {
  fetch: app.fetch,
};

// Durable Objects.
export { Publish } from '@/publish';
// #endregion
