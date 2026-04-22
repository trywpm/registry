import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Context } from 'hono';
import type { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const cacheKey = new Request(`https://r2-cache/${key}`);

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
