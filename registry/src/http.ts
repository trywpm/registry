import { cache } from '@/lib/cache';

const NOT_FOUND_BODY = JSON.stringify({ error: 'not found' });

export const JSON_TYPE = { 'Content-Type': 'application/json' };
export const TEXT_TYPE = { 'Content-Type': 'text/plain; charset=UTF-8' };
export const HOME_BODY = JSON.stringify({ name: 'wpm registry', version: '0.1.0' });

export function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers ? { ...JSON_TYPE, ...headers } : JSON_TYPE,
  });
}

export const notFound = (): Response =>
  new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: { ...JSON_TYPE, 'Cache-Control': 'no-store' },
  });

export const notFoundCacheable = (name: string): Response =>
  new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: { ...JSON_TYPE, ...cache.notFound(name) },
  });

export function decodeSegment(segment: string): string {
  if (!segment.includes('%')) {
    return segment;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
