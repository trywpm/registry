import type { Sql } from 'postgres';

const NULL_TTL = 60; // 1 minute
const NULL_SENTINEL = '__null__';
const isNullSentinel = (v: unknown): boolean => v === NULL_SENTINEL;

type CacheOptions = {
  ttl?: number;
  force?: boolean;
  cacheNull?: boolean;
  cacheTtl?: number;
};

export abstract class Base {
  constructor(
    private readonly getDb: () => Promise<Sql>,
    protected readonly kv: KVNamespace,
  ) {}

  protected sql(): Promise<Sql> {
    return this.getDb();
  }

  protected async cached<T>(
    key: string,
    fn: () => Promise<T | null>,
    options: CacheOptions = {},
  ): Promise<T | null> {
    if (!options.force) {
      try {
        const parsed = options.cacheTtl
          ? await this.kv.get<T>(key, { type: 'json', cacheTtl: options.cacheTtl })
          : await this.kv.get<T>(key, { type: 'json' });
        if (parsed != null) {
          if (isNullSentinel(parsed)) {
            return null;
          }

          return parsed;
        }
      } catch {}
    }

    const result = await fn();

    try {
      if (result != null) {
        if (!options.ttl || options.ttl >= 60) {
          await this.kv.put(
            key,
            JSON.stringify(result),
            options.ttl ? { expirationTtl: options.ttl } : {},
          );
        }
      } else if (options.cacheNull) {
        await this.kv.put(key, JSON.stringify(NULL_SENTINEL), { expirationTtl: NULL_TTL });
      }
    } catch {}

    return result;
  }

  protected async cachedBody<M>(
    key: string,
    fn: () => Promise<{ value: string; metadata: M } | null>,
    options: CacheOptions = {},
  ): Promise<{ value: string; metadata: M } | null> {
    if (!options.force) {
      try {
        const hit = options.cacheTtl
          ? await this.kv.getWithMetadata<M>(key, { cacheTtl: options.cacheTtl })
          : await this.kv.getWithMetadata<M>(key);
        if (hit.value === NULL_SENTINEL) {
          return null;
        }
        if (hit.value != null && hit.metadata != null) {
          return { value: hit.value, metadata: hit.metadata };
        }
      } catch {}
    }

    const result = await fn();

    try {
      if (result != null) {
        if (!options.ttl || options.ttl >= 60) {
          await this.kv.put(
            key,
            result.value,
            options.ttl
              ? { metadata: result.metadata, expirationTtl: options.ttl }
              : { metadata: result.metadata },
          );
        }
      } else if (options.cacheNull) {
        await this.kv.put(key, NULL_SENTINEL, { expirationTtl: NULL_TTL });
      }
    } catch {}

    return result;
  }

  protected async invalidate(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    await Promise.all(keys.map((k) => this.kv.delete(k)));
  }
}
