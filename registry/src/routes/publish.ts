import type { RequestContext } from '@/lib/context';

import { canToken, canUser } from '@wpm/rbac';
import { isValidPackageName, isValidSemver } from '@wpm/manifest/validator';

import { json, notFound } from '@/http';
import { uploadToStaging, uploadErrorResponse } from '@/lib/tarball';
import { MAX_UPLOAD_SIZE, PackageStreamReader } from '@/lib/package-stream-reader';

export async function publish(
  ctx: RequestContext,
  name: string,
  version: string,
): Promise<Response> {
  if (!isValidPackageName(name)) {
    return notFound();
  }

  if (!isValidSemver(version)) {
    return notFound();
  }

  if (!ctx.req.body) {
    return json({ error: 'missing request body' }, 400);
  }

  const contentLengthHeader = ctx.req.headers.get('Content-Length');
  if (!contentLengthHeader) {
    return json({ error: 'missing content length header' }, 411);
  }

  const contentLength = parseInt(contentLengthHeader, 10);
  if (isNaN(contentLength) || contentLength <= 0) {
    return json({ error: 'invalid content length header' }, 400);
  }

  if (contentLength > MAX_UPLOAD_SIZE) {
    return json({ error: 'payload too large' }, 413);
  }

  const auth = await ctx.auth();
  if (auth instanceof Response) {
    return auth;
  }

  const user = auth;
  if (!user) {
    return json({ error: 'requires authentication' }, 401);
  }

  if (!user.userId) {
    throw new Error('authenticated user is missing userId');
  }
  if (!user.tokenId) {
    throw new Error('authenticated user is missing tokenId');
  }

  if (!canToken(user.tokenScopes, 'publish', 'package')) {
    return json({ error: 'missing token scope to publish package' }, 403);
  }

  const reader = new PackageStreamReader(ctx.req.body);
  const reject = async (error: string, status: 400 | 403 | 404 | 409) => {
    await reader.cancel();
    return json({ error }, status);
  };

  // Load lazily to avoid the cold start penalty.
  const { PackageSchema, formatZodError } = await import('@wpm/manifest');

  const manifest = await reader.getManifest();
  const parsedManifest = PackageSchema.safeParse(manifest);
  if (!parsedManifest.success) {
    return reject(formatZodError(parsedManifest.error), 400);
  }

  if (parsedManifest.data.name !== name || parsedManifest.data.version !== version) {
    return reject('bad request', 400);
  }

  if (4 + reader.manifestByteLength + parsedManifest.data.dist.packedSize !== contentLength) {
    return reject('content-length does not match the framed payload size', 400);
  }

  const access = await ctx.repos.packages.getAccess(name, user.userId);
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
    if (await ctx.repos.packages.versionExists(access.id, version)) {
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

  const alreadyStaged = (await ctx.env.tarball.head(stagingKey).catch(() => null)) != null;
  if (alreadyStaged) {
    await reader.cancel();
  } else {
    try {
      await uploadToStaging(
        ctx.env,
        stagingKey,
        reader.getTarballStream(),
        parsedManifest.data.dist,
      );
    } catch (err) {
      ctx.logger().warn('tarball upload rejected', { err });
      return uploadErrorResponse(err, parsedManifest.data.dist);
    }
  }

  const stub = ctx.env.publish.getByName(name);
  return stub.publish(parsedManifest.data, stagingKey, {
    userId: user.userId,
    requestId: ctx.requestId,
  });
}
