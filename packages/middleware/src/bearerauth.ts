import { IPCidrMatcher } from '@wpm/util/net';
import { createMiddleware } from 'hono/factory';
import { getAuthTokenHash } from '@wpm/util/token';

import type { Context, MiddlewareHandler } from 'hono';

type Config = {
  authRequired: boolean;
  getUserFromToken: (tokenHash: string) => Promise<{
    email: string;
    userId: number;
    tokenId: number;
    username: string;
    status: 'active' | 'inactive' | 'banned' | 'locked';

    cidr?: string[];
    scopes: string[];
    expiry?: Date;
  } | null>;
};

const PREFIX = 'Bearer ';
const PREFIX_LEN = PREFIX.length; // 7
const TOKEN_REGEX = /^wpm_\w{60}$/;
const HEADER_LEN = PREFIX_LEN + 4 + 60; // "Bearer " + "wpm_" + 60 chars = 71

function parseBearerToken(authHeader: string): string | null {
  if (authHeader.length !== HEADER_LEN) {
    return null;
  }

  if (
    authHeader.charCodeAt(0) !== 0x42 || // B
    authHeader.charCodeAt(1) !== 0x65 || // e
    authHeader.charCodeAt(2) !== 0x61 || // a
    authHeader.charCodeAt(3) !== 0x72 || // r
    authHeader.charCodeAt(4) !== 0x65 || // e
    authHeader.charCodeAt(5) !== 0x72 || // r
    authHeader.charCodeAt(6) !== 0x20 // space
  ) {
    return null;
  }

  const token = authHeader.slice(PREFIX_LEN);
  return TOKEN_REGEX.test(token) ? token : null;
}

export const bearerAuthMiddleware = (config: Config): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    if (!c.env.AUTH_HMAC_KEY) {
      throw new Error('AUTH_HMAC_KEY is not configured');
    }

    // Check auth header requirements.
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      if (config.authRequired) {
        c.header('WWW-Authenticate', `Bearer realm="registry"`);
        return c.json({ error: 'requires authentication' }, 401);
      }

      return next();
    }

    // Validate and parse token.
    const bearerToken = parseBearerToken(authHeader);
    if (!bearerToken) {
      c.header('WWW-Authenticate', `Bearer realm="registry", error="invalid_token"`);
      return c.json({ error: 'bad credentials' }, 401);
    }

    // Lookup token in database after hashing.
    const ut = await config.getUserFromToken(
      await getAuthTokenHash(bearerToken, c.env.AUTH_HMAC_KEY),
    );
    if (!ut) {
      c.header('WWW-Authenticate', `Bearer realm="registry", error="invalid_token"`);
      return c.json({ error: 'bad credentials' }, 401);
    }

    // Check user status.
    if (ut.status !== 'active') {
      return c.json({ error: 'user account is not active' }, 403);
    }

    // Check token expiry.
    if (ut.expiry && ut.expiry.getTime() < Date.now()) {
      c.header(
        'WWW-Authenticate',
        `Bearer realm="registry", error="invalid_token", error_description="token has expired"`,
      );
      return c.json({ error: 'token has expired' }, 401);
    }

    // Check CIDR restrictions.
    if (ut.cidr && ut.cidr.length > 0) {
      const ip = c.req.header('True-Client-IP');
      if (!ip) {
        return c.json({ error: 'unable to determine client ip' }, 500);
      }

      try {
        const m = new IPCidrMatcher(ut.cidr);
        if (!m.contains(ip)) {
          return c.json({ error: `ip ${ip} not in token allowlist` }, 403);
        }
      } catch {
        return c.json({ error: 'invalid cidr configuration on token' }, 500);
      }
    }

    // Add info to context.
    c.set('userId', ut.userId);
    c.set('tokenId', ut.tokenId);
    c.set('username', ut.username);
    c.set('userEmail', ut.email);
    c.set('tokenScopes', ut.scopes);

    return next();
  });
};

export function userIdFromContext(c: Context) {
  return c.get('userId');
}

export function tokenIdFromContext(c: Context) {
  return c.get('tokenId');
}

export function usernameFromContext(c: Context) {
  return c.get('username');
}

export function tokenScopesFromContext(c: Context) {
  return c.get('tokenScopes');
}

export function userEmailFromContext(c: Context) {
  return c.get('userEmail');
}
