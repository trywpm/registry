import type { RequestContext } from '@/lib/context';

import { Presigner } from '@wpm/storage';
import { isValidPackageName, isValidSemver } from '@wpm/manifest/validator';

import { requirePackageViewer } from '@/lib/auth';
import { json, notFound, TEXT_TYPE } from '@/http';

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
    return notFound();
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
      'Cache-Control': result.metadata.v === 'public' ? 'public, max-age=60' : 'no-store',
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
    return notFound();
  }

  if (result.metadata.v !== 'public') {
    const denied = await requirePackageViewer(ctx, name);
    if (denied instanceof Response) {
      return denied;
    }
  }

  const headers: Record<string, string> = {
    'Last-Modified': result.metadata.lm,
    'Cache-Control':
      result.metadata.v === 'public' ? 'public, max-age=31536000, immutable' : 'no-store',
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
    return notFound();
  }

  if (result.visibility !== 'public') {
    const denied = await requirePackageViewer(ctx, name);
    if (denied instanceof Response) {
      return denied;
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/${name}/${result.version}`, 'Cache-Control': 'no-store' },
  });
}

let presigner: Presigner | undefined;

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

  presigner ??= new Presigner({
    region: ctx.env.AWS_REGION,
    bucket: ctx.env.S3_BUCKET,
    endpoint: ctx.env.AWS_ENDPOINT_URL,
    accessKeyId: ctx.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: ctx.env.AWS_SECRET_ACCESS_KEY,
  });

  const url = await presigner.get({
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

  return new Response(null, { status: 302, headers: { Location: url } });
}
