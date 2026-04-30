import { describe, expect, it } from 'vitest';

import { getSafeHomepageUrl } from '@/components/package-sidebar/package-sidebar';
import { serializeJsonLd } from '@/layouts/base';

describe('getSafeHomepageUrl', () => {
  it('returns normalized http and https urls', () => {
    expect(getSafeHomepageUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(getSafeHomepageUrl('http://example.com/path')).toBe('http://example.com/path');
  });

  it('rejects unsupported schemes and invalid urls', () => {
    expect(getSafeHomepageUrl('javascript:alert(1)')).toBe('');
    expect(getSafeHomepageUrl('data:text/html,hello')).toBe('');
    expect(getSafeHomepageUrl('not a url')).toBe('');
  });
});

describe('serializeJsonLd', () => {
  it('escapes script-breaking characters', () => {
    expect(
      serializeJsonLd({
        name: '</script><script>alert(1)</script>',
        description: 'Fish & Chips \u2028 \u2029',
      }),
    ).toBe(
      '{"name":"\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E","description":"Fish \\u0026 Chips \\u2028 \\u2029"}',
    );
  });
});
