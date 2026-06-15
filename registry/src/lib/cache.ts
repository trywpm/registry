import type { RequestContext } from '@/lib/context';
import type { PackageType } from '@wpm/types';

import { purgeCacheByTags } from '@wpm/util';

const PUBLIC = 'public, max-age=86400, s-maxage=604800, must-revalidate';

const tags = (name: string, type?: PackageType, doc = false): string => {
  const t = [`pkg:${name}`];
  if (type) {
    t.push(`pkg:type:${type}`);
  }
  if (doc) {
    t.push(`pkg:doc:${name}`);
  }
  return t.join(',');
};

export const cache = {
  public(name: string, type?: PackageType, doc = false): Record<string, string> {
    return {
      Vary: 'Accept-Encoding',
      'Cache-Tag': tags(name, type, doc),
      'Cache-Control': PUBLIC,
    };
  },

  private: { 'Cache-Control': 'private' },

  notFound(name: string): Record<string, string> {
    return {
      'Cache-Tag': `pkg:${name}`,
      'Cache-Control': 'public, max-age=300',
    };
  },
};

export async function bustPackageCache(ctx: RequestContext, name: string): Promise<void> {
  if (ctx.env.APP_ENV === 'development') {
    return;
  }

  const result = await purgeCacheByTags(
    { zoneId: ctx.env.CLOUDFLARE_ZONE_ID, apiToken: ctx.env.CLOUDFLARE_API_TOKEN },
    [`pkg:${name}`],
  );

  if (!result.ok) {
    ctx.logger().error('edge cache purge failed', {
      name,
      body: result.body,
      status: result.status,
    });
  }
}
