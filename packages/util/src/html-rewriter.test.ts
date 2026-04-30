import { describe, expect, it } from 'vitest';

import { escapeHtmlAttribute, getSafeEmbeddableUrl } from './html-rewriter';

describe('escapeHtmlAttribute', () => {
  it('escapes dangerous attribute characters', () => {
    expect(escapeHtmlAttribute(`"&'<>`)).toBe('&quot;&amp;&#39;&lt;&gt;');
  });
});

describe('getSafeEmbeddableUrl', () => {
  it('returns normalized allowed embed urls', () => {
    expect(getSafeEmbeddableUrl('https://www.videopress.com/embed/example')).toEqual({
      domain: 'videopress.com',
      href: 'https://www.videopress.com/embed/example',
    });
  });

  it('rejects unsupported schemes and hosts', () => {
    expect(getSafeEmbeddableUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeEmbeddableUrl('https://example.com/embed/example')).toBeNull();
  });

  it('normalizes escaped characters inside allowed embed urls', () => {
    expect(getSafeEmbeddableUrl('https://videopress.com/embed/"unsafe"')?.href).toBe(
      'https://videopress.com/embed/%22unsafe%22',
    );
  });
});
