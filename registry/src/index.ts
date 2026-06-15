import { UserError } from '@wpm/exception';
import { isValidPackageName, isValidSemver, isValidTagName } from '@wpm/manifest/validator';

import { publish } from '@/routes/publish';
import { distTag } from '@/routes/dist-tag';
import { scheduler } from '@/scheduler';
import { RequestContext } from '@/lib/context';
import { json, notFound, decodeSegment, JSON_TYPE, HOME_BODY } from '@/http';
import { whoami, redirectTag, serveTarball, serveManifest, servePackageDoc } from '@/routes/read';

async function handleRequest(
  request: Request,
  env: Cloudflare.Env,
  ec: ExecutionContext,
): Promise<Response> {
  const ctx = new RequestContext(request, env, ec);

  try {
    return await route(ctx);
  } catch (err) {
    if (err instanceof UserError) {
      return json({ error: err.message }, err.status);
    }

    ctx.logger().error('unhandled error', { err });
    return json({ error: 'internal server error' }, 500);
  }
}

function route(ctx: RequestContext): Promise<Response> | Response {
  const url = ctx.req.url;
  const method = ctx.req.method;

  const start = url.indexOf('/', 8); // first '/' after "http(s)://"

  let end = url.indexOf('?', start);
  if (end === -1) {
    end = url.length;
  }

  if (end - start === 1) {
    return method === 'GET' ? new Response(HOME_BODY, { headers: JSON_TYPE }) : notFound();
  }

  let slash = url.indexOf('/', start + 1);
  if (slash >= end) {
    slash = -1; // a '/' inside the query string is not a path separator
  }
  const first = url.slice(start + 1, slash === -1 ? end : slash);

  // '-' is never a valid package name, so `/-/` is a collision-free meta namespace.
  if (first === '-') {
    return meta(ctx, slash === -1 ? '' : url.slice(slash + 1, end));
  }

  if (method !== 'GET' && method !== 'PUT') {
    return notFound();
  }

  if (slash === -1) {
    return method === 'GET' ? servePackageDoc(ctx, first) : notFound();
  }

  if (slash >= end - 1) {
    return notFound();
  }

  const third = url.indexOf('/', slash + 1);
  if (third !== -1 && third < end) {
    return notFound();
  }

  const selector = decodeSegment(url.slice(slash + 1, end));
  return method === 'GET' ? handleGet(ctx, first, selector) : publish(ctx, first, selector);
}

/** Handles requests to the `/-/` meta namespace. */
function meta(ctx: RequestContext, subpath: string): Promise<Response> | Response {
  const parts = subpath.split('/');

  if (parts[0] === 'whoami' && parts.length === 1) {
    return ctx.req.method === 'GET' ? whoami(ctx) : notFound();
  }

  if (parts[0] === 'dist-tags' && parts.length === 3) {
    const pkg = parts[1];
    const tag = parts[2];
    return pkg && tag ? distTag(ctx, pkg, decodeSegment(tag)) : notFound();
  }

  return notFound();
}

function handleGet(
  ctx: RequestContext,
  name: string,
  selector: string,
): Promise<Response> | Response {
  if (!isValidPackageName(name)) {
    return notFound();
  }

  if (selector.endsWith('.tar.zst')) {
    // '.tar.zst' is 8 characters.
    return serveTarball(ctx, name, selector.slice(0, -8));
  }

  if (isValidSemver(selector)) {
    return serveManifest(ctx, name, selector);
  }

  return isValidTagName(selector) ? redirectTag(ctx, name, selector) : notFound();
}

export default {
  fetch: handleRequest,
  scheduled: scheduler,
};

// Durable Objects.
export { Publish } from '@/publish';
