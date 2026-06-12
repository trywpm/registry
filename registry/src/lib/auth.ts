import type { RequestContext } from '@/lib/context';
import type { UserWithToken, PackageAccess } from '@wpm/db';

import { IPCidrMatcher } from '@wpm/net';
import { canToken, canUser } from '@wpm/rbac';
import { getAuthTokenHash, parseBearerToken } from '@wpm/auth';

import { json, notFound } from '@/http';

export async function authenticate(ctx: RequestContext): Promise<UserWithToken | Response | null> {
  // Check auth header requirements.
  const authHeader = ctx.req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Validate and parse token.
  const bearerToken = parseBearerToken(authHeader);
  if (!bearerToken) {
    return json({ error: 'bad credentials' }, 401, {
      'WWW-Authenticate': `Bearer realm="registry", error="invalid_token"`,
    });
  }

  const tokenHash = await getAuthTokenHash(bearerToken, ctx.env.PAT_HMAC_KEY);

  // Lookup token in database after hashing.
  const user = await ctx.repos.users.getByToken(tokenHash);
  if (!user) {
    return json({ error: 'bad credentials' }, 401, {
      'WWW-Authenticate': `Bearer realm="registry", error="invalid_token"`,
    });
  }

  // Check user status.
  if (user.status !== 'active') {
    return json({ error: 'user account is not active' }, 403);
  }

  if (user.tokenExpiry && new Date(user.tokenExpiry).getTime() < Date.now()) {
    return json({ error: 'token has expired' }, 401, {
      'WWW-Authenticate': `Bearer realm="registry", error="invalid_token", error_description="token has expired"`,
    });
  }

  // Check CIDR restrictions.
  if (user.tokenCidrs && user.tokenCidrs.length > 0) {
    const ip = ctx.req.headers.get('True-Client-IP');
    if (!ip) {
      return json({ error: 'unable to determine client ip' }, 500);
    }

    try {
      const m = new IPCidrMatcher(user.tokenCidrs);
      if (!m.contains(ip)) {
        return json({ error: `ip ${ip} not in token allowlist` }, 403);
      }
    } catch {
      return json({ error: 'invalid cidr configuration on token' }, 500);
    }
  }

  return user;
}

export async function requirePackageViewer(
  ctx: RequestContext,
  name: string,
): Promise<Response | PackageAccess> {
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

  if (!canToken(auth.tokenScopes, 'view', 'package')) {
    return json({ error: 'missing token scope to access package' }, 403);
  }

  if (!canUser(access.role, 'view', 'package')) {
    return notFound();
  }

  return access;
}
