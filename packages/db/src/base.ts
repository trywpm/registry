import type { Sql } from 'postgres';

const NULL_TTL = 60; // 1 minute
const NULL_SENTINEL = '__null__';

export abstract class Base {
  constructor(
    protected readonly db: Sql,
    protected readonly kv: KVNamespace,
  ) {}

  protected async cached<T>(
    key: string,
    fn: () => Promise<T | null>,
    options: { ttl?: number; force?: boolean; cacheNull?: boolean } = {},
  ): Promise<T | null> {
    if (!options.force) {
      try {
        const raw = await this.kv.get(key);
        if (raw != null) {
          const parsed = JSON.parse(raw);
          if (parsed === NULL_SENTINEL) {
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

  protected async invalidate(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    await Promise.all(keys.map((k) => this.kv.delete(k)));
  }
}
