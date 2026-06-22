import type { Context } from 'hono';

import manifest from 'virtual:client-manifest';

export const ALLOWED_QUERY_PARAMS = ['q', 'sort', 'page'] as const;

export function humanSize(bytesNum: number, precision = 4) {
  if (bytesNum === 0) {
    return '0B';
  }

  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const base = 1000;

  let i = 0;
  let size = bytesNum;

  while (size >= base && i < units.length - 1) {
    size /= base;
    i++;
  }

  return `${Number(size.toPrecision(precision))} ${units[i]}`;
}

export async function getCachedReadme(c: Context, key: string) {
  const cache = await caches.open('r2-cache');
  const cacheKey = `https://r2-cache/${key}`;

  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  const object = await c.env.readme.get(key);
  if (!object) {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Tag', `readmes ${key}`);
  headers.set('Cache-Control', `s-maxage=31536000, must-revalidate`);

  response = new Response(object.body, {
    headers,
  });

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

const assetUrlCache = new Map<string, string>();
export function getAssetUrl(path: string) {
  const cached = assetUrlCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  let resolved = path;
  if (!import.meta.env.DEV) {
    const key = resolved.startsWith('/') ? resolved.slice(1) : resolved;

    resolved = manifest[key].file ?? '';
    if (!resolved) {
      throw new Error(`Component ${key} not found in manifest`);
    }

    if (!resolved.startsWith('/')) {
      resolved = `/${resolved}`;
    }
  }

  assetUrlCache.set(path, resolved);

  return resolved;
}

export const getCanonicalUrl = (
  url: string | URL,
  queryParamsToPreserve: (typeof ALLOWED_QUERY_PARAMS)[number][] = [],
): string => {
  if (queryParamsToPreserve.length === 0) {
    if (typeof url !== 'string') {
      return `${url.origin}${url.pathname}`;
    }

    let end = url.length;
    const q = url.indexOf('?');
    if (q !== -1) {
      end = q;
    }
    const h = url.indexOf('#');
    if (h !== -1 && h < end) {
      end = h;
    }

    return url.slice(0, end);
  }

  const newUrl = typeof url === 'string' ? new URL(url) : url;
  const canonical = new URL(newUrl.pathname, newUrl.origin);
  queryParamsToPreserve.forEach((param) => {
    if (newUrl.searchParams.has(param)) {
      canonical.searchParams.set(param, newUrl.searchParams.get(param) ?? '');
    }
  });
  canonical.searchParams.sort();

  return canonical.toString();
};

export { cn } from 'cnfast';
