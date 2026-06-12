import { UserError } from '@wpm/exception';
import { isValidPackageName, isValidSemver, isValidTagName } from '@wpm/manifest/validator';

import { publish } from '@/routes/publish';
import { scheduler } from '@/scheduler';
import { RequestContext } from '@/lib/context';
import { json, notFound, decodeSegment, JSON_TYPE, HOME_BODY } from '@/http';
import { whoami, redirectTag, serveTarball, serveManifest, servePackageDoc } from '@/routes/read';

async function handleRequest(request: Request, env: Cloudflare.Env): Promise<Response> {
  const ctx = new RequestContext(request, env);

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

  if (method !== 'GET' && method !== 'PUT') {
    return notFound();
  }

  const slash = url.indexOf('/', start + 1);

  // If only a single segment, it's `/:package` route.
  if (slash === -1) {
    return method === 'GET' ? servePackageDoc(ctx, url.slice(start + 1, end)) : notFound();
  }

  // Otherwise, parse the path as /:package/:selector (two non-empty segments).
  // The meta routes like /-/whoami route naturally fits this shape because '-'
  //  is never a valid package name. All parsing is constrained to `end`, ensuring
  // that query string contents cannot influence path matching.
  if (slash >= end - 1) {
    return notFound();
  }

  // Reject paths with more than two segments.
  const third = url.indexOf('/', slash + 1);
  if (third !== -1 && third < end) {
    return notFound();
  }

  const name = url.slice(start + 1, slash); // first segment.
  const selector = decodeSegment(url.slice(slash + 1, end)); // second segment.
  return method === 'GET' ? handleGet(ctx, name, selector) : publish(ctx, name, selector);
}

function handleGet(
  ctx: RequestContext,
  name: string,
  selector: string,
): Promise<Response> | Response {
  if (name === '-') {
    return selector === 'whoami' ? whoami(ctx) : notFound();
  }

  if (!isValidPackageName(name)) {
    return notFound();
  }

  if (selector.endsWith('.tar.zst')) {
    // '.tar.zst'.length === 8
    return serveTarball(ctx, name, selector.slice(0, -8));
  }

  if (isValidSemver(selector)) {
    return serveManifest(ctx, name, selector);
  }

  if (isValidTagName(selector)) {
    return redirectTag(ctx, name, selector);
  }

  return notFound();
}

export default {
  fetch: handleRequest,
  scheduled: scheduler,
};

// Durable Objects.
export { Publish } from '@/publish';
