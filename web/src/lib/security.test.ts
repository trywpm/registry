import { describe, expect, it } from 'vitest';

import { getSafeHomepageUrl } from '@/components/package-sidebar/package-sidebar';

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
