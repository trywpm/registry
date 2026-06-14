import type { PackageType } from '@wpm/types';

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
