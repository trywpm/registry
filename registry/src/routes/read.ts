import type { RequestContext } from '@/lib/context';

import { isValidPackageName, isValidSemver } from '@wpm/manifest/validator';

import { cache } from '@/lib/cache';
import { getPresigner } from '@/lib/presigner';
import { requirePackageViewer } from '@/lib/auth';
import { json, notFound, notFoundCacheable, TEXT_TYPE } from '@/http';

export async function whoami(ctx: RequestContext): Promise<Response> {
  const auth = await ctx.auth();
  if (auth instanceof Response) {
    return auth;
  }

  if (!auth) {
    return json({ error: 'unauthorized' }, 401);
  }

  return new Response(auth.username, { headers: TEXT_TYPE });
}

export async function servePackageDoc(ctx: RequestContext, name: string): Promise<Response> {
  if (!isValidPackageName(name)) {
    return notFound();
  }

  const result = await ctx.repos.packages.getPackageDocument(name);
  if (!result) {
    return notFoundCacheable(name);
  }

  if (result.metadata.v !== 'public') {
    const denied = await requirePackageViewer(ctx, name);
    if (denied instanceof Response) {
      return denied;
    }
  }

  return new Response(result.value, {
    headers: {
      'Content-Type': 'application/json',
      ...(result.metadata.v === 'public'
        ? cache.public(name, result.metadata.t, true)
        : cache.private),
    },
  });
}

export async function serveManifest(
  ctx: RequestContext,
  name: string,
  version: string,
): Promise<Response> {
  const result = await ctx.repos.packages.getManifest(name, version);
  if (!result) {
    return notFoundCacheable(name);
  }

  if (result.metadata.v !== 'public') {
    const denied = await requirePackageViewer(ctx, name);
    if (denied instanceof Response) {
      return denied;
    }
  }

  const headers: Record<string, string> = {
    'Last-Modified': result.metadata.lm,
    ...(result.metadata.v === 'public' ? cache.public(name, result.metadata.t) : cache.private),
  };

  if (ctx.req.headers.get('If-Modified-Since') === result.metadata.lm) {
    return new Response(null, { status: 304, headers });
  }

  headers['Content-Type'] = 'application/json';
  return new Response(result.value, { headers });
}

export async function redirectTag(
  ctx: RequestContext,
  name: string,
  tag: string,
): Promise<Response> {
  const result = await ctx.repos.packages.getTagVersion(name, tag);
  if (!result) {
    return notFoundCacheable(name);
  }

  if (result.visibility !== 'public') {
    const denied = await requirePackageViewer(ctx, name);
    if (denied instanceof Response) {
      return denied;
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/${name}/${result.version}`,
      ...(result.visibility === 'public' ? cache.distTag(name) : { 'Cache-Control': 'no-store' }),
    },
  });
}

export async function serveTarball(
  ctx: RequestContext,
  name: string,
  version: string,
): Promise<Response> {
  if (!isValidSemver(version)) {
    return notFound();
  }

  const auth = await ctx.auth();
  if (auth instanceof Response) {
    return auth;
  }
  if (!auth) {
    return json({ error: 'requires authentication' }, 401);
  }

  const access = await requirePackageViewer(ctx, name);
  if (access instanceof Response) {
    return access;
  }

  const url = await getPresigner(ctx.env).get({
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
    key: `${access.visibility}-packages/${name}/${version}.tar.zst`,
    expiresIn: 3600,
  });

  return new Response(null, { status: 302, headers: { Location: url } });
}
