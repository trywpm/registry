import { fetchWithRetry } from './fetch-with-retry';

const API_BASE = 'https://api.cloudflare.com/client/v4/zones';
const MAX_TAGS_PER_REQUEST = 30;

export type PurgeCacheConfig = {
  readonly zoneId: string;
  readonly apiToken: string;
};

export type PurgeResult = {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: string;
};

/** Purge edge-cached responses by Cache-Tag for a single zone. */
export async function purgeCacheByTags(
  cfg: PurgeCacheConfig,
  tags: readonly string[],
): Promise<PurgeResult> {
  if (tags.length === 0) {
    return { ok: true, status: 0 };
  }
  if (tags.length > MAX_TAGS_PER_REQUEST) {
    throw new Error(`purgeCacheByTags: at most ${MAX_TAGS_PER_REQUEST} tags per request`);
  }

  const res = await fetchWithRetry(() => ({
    url: `${API_BASE}/${cfg.zoneId}/purge_cache`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiToken}`,
      },
      body: JSON.stringify({ tags }),
    },
  }));

  if (res.ok) {
    return { ok: true, status: res.status };
  }

  return { ok: false, status: res.status, body: await res.text() };
}
