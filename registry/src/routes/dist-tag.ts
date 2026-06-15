import type { RequestContext } from '@/lib/context';
import type { PackageAccess } from '@wpm/db';

import { canToken, canUser } from '@wpm/rbac';
import { isValidPackageName, isValidTagName, isValidSemver } from '@wpm/manifest/validator';

import { json, notFound } from '@/http';

// A dist-tag request body is just `{ version }`; cap it well above that.
const MAX_BODY_BYTES = 1024;

export function distTag(
  ctx: RequestContext,
  name: string,
  tag: string,
): Promise<Response> | Response {
  if (!isValidPackageName(name)) {
    return notFound();
  }

  if (ctx.req.method === 'PUT') {
    return setTag(ctx, name, tag);
  }

  if (ctx.req.method === 'DELETE') {
    return removeTag(ctx, name, tag);
  }

  return notFound();
}

async function setTag(ctx: RequestContext, name: string, tag: string): Promise<Response> {
  if (!isValidTagName(tag)) {
    return json({ error: 'invalid dist-tag name' }, 400);
  }

  const contentLength = Number(ctx.req.headers.get('Content-Length'));
  if (!contentLength || contentLength > MAX_BODY_BYTES) {
    return json({ error: 'invalid or oversized request body' }, 413);
  }

  const access = await authorize(ctx, name);
  if (access instanceof Response) {
    return access;
  }

  let parsed: { version?: string } | null;
  try {
    parsed = await ctx.req.json<{ version?: string } | null>();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }

  const version = parsed?.version;
  if (typeof version !== 'string' || !isValidSemver(version)) {
    return json({ error: 'invalid or missing version' }, 400);
  }

  const ok = await ctx.repos.packages.setDistTag(name, access.id, tag, version);
  if (!ok) {
    return json({ error: `${name}@${version} does not exist` }, 404);
  }

  return new Response(null, { status: 204 });
}

async function removeTag(ctx: RequestContext, name: string, tag: string): Promise<Response> {
  // The `latest` tag must always resolve, so it can never be removed.
  if (tag === 'latest') {
    return json({ error: 'the "latest" dist-tag cannot be removed' }, 409);
  }

  if (!isValidTagName(tag)) {
    return json({ error: 'invalid dist-tag name' }, 400);
  }

  const access = await authorize(ctx, name);
  if (access instanceof Response) {
    return access;
  }

  const removed = await ctx.repos.packages.removeDistTag(name, access.id, tag);
  if (!removed) {
    return notFound();
  }

  return new Response(null, { status: 204 });
}

async function authorize(ctx: RequestContext, name: string): Promise<PackageAccess | Response> {
  const auth = await ctx.auth();
  if (auth instanceof Response) {
    return auth;
  }

  if (!auth?.userId) {
    return notFound();
  }

  const access = await ctx.repos.packages.getAccess(name, auth.userId);
  if (!access || !access.role || access.status === 'deleted') {
    return notFound();
  }

  if (!canToken(auth.tokenScopes, 'edit', 'package')) {
    return json({ error: 'missing token scope to edit package' }, 403);
  }

  if (access.status !== 'active') {
    return json({ error: `${name} is not accepting changes` }, 403);
  }

  if (!canUser(access.role, 'edit', 'package')) {
    return json({ error: 'user is not authorized to edit package' }, 403);
  }

  return access;
}
