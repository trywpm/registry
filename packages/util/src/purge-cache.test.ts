import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { purgeCacheByTags } from './purge-cache';

const CFG = { zoneId: 'zone123', apiToken: 'tok_secret' };

type Captured = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

function toRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

const captured: Captured[] = [];
let status = 200;

beforeEach(() => {
  captured.length = 0;
  status = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      captured.push({
        url: input instanceof Request ? input.url : String(input),
        method: init?.method ?? 'GET',
        headers: toRecord(init?.headers),
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return new Response(JSON.stringify({ success: status < 400 }), { status });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('purgeCacheByTags', () => {
  it('POSTs the tags to the zone purge endpoint with bearer auth', async () => {
    const res = await purgeCacheByTags(CFG, ['pkg:foo', 'pkg:bar']);

    expect(res).toEqual({ ok: true, status: 200 });
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe('https://api.cloudflare.com/client/v4/zones/zone123/purge_cache');
    expect(captured[0].method).toBe('POST');
    expect(captured[0].headers['authorization']).toBe('Bearer tok_secret');
    expect(captured[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(captured[0].body)).toEqual({ tags: ['pkg:foo', 'pkg:bar'] });
  });

  it('is a no-op for an empty tag list', async () => {
    const res = await purgeCacheByTags(CFG, []);
    expect(res).toEqual({ ok: true, status: 0 });
    expect(captured).toHaveLength(0);
  });

  it('throws above the 30-tag-per-request cap', async () => {
    const tags = Array.from({ length: 31 }, (_, i) => `pkg:p${i}`);
    await expect(purgeCacheByTags(CFG, tags)).rejects.toThrow();
    expect(captured).toHaveLength(0);
  });

  it('returns the failure (with body) instead of throwing on a 4xx', async () => {
    status = 403;
    const res = await purgeCacheByTags(CFG, ['pkg:foo']);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.body).toContain('"success":false');
  });
});
