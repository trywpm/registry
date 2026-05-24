import { createHmac } from 'node:crypto';

import { fc, it } from '@fast-check/vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, vi } from 'vitest';

import type { MockInstance } from 'vitest';

import { generateWpmAuthToken, getAuthTokenHash, parseBearerToken, randString } from './token';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
const CHARSET_ARRAY = Array.from({ length: CHARSET.length }, (_, i) => CHARSET[i]);

const PREFIX = 'wpm_';
const MAX_LEN = 128;
const PREFIX_LEN = PREFIX.length;
const TOKEN_RANDOM_LEN = 60;

const TOKEN_TOTAL_LEN = PREFIX_LEN + TOKEN_RANDOM_LEN; // 64

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const TOKEN_BODY_REGEX = /^[A-Za-z0-9_]+$/;
const FULL_WPM_TOKEN_REGEX = /^wpm_[A-Za-z0-9_]{60}$/;

const referenceHash = (token: string, key: string): string =>
  createHmac('sha256', key).update(token).digest('base64url');

const chaosStringArb = (maxLength: number) =>
  fc
    .array(
      fc.integer({ min: 0, max: 0xffff }).map((c) => String.fromCharCode(c)),
      { minLength: 1, maxLength },
    )
    .map((cs) => cs.join(''));

const chaoticInputArb = fc.record({
  key: chaosStringArb(100),
  token: fc
    .tuple(chaosStringArb(200), fc.boolean())
    .map(([base, prefixed]) => (prefixed ? `${PREFIX}${base}` : base)),
});

const uniqueSecret = (label: string): string =>
  `cache-test-${label}-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const importKeyCallsForSecret = (
  spy: MockInstance<typeof crypto.subtle.importKey>,
  secret: string,
): number => {
  const target = new TextEncoder().encode(secret);
  return spy.mock.calls.filter((call) => {
    const format = call[0];
    const keyData = call[1];
    if (format !== 'raw') {
      return false;
    }
    let bytes: Uint8Array;
    if (keyData instanceof Uint8Array) {
      bytes = keyData;
    } else if (keyData instanceof ArrayBuffer) {
      bytes = new Uint8Array(keyData);
    } else {
      return false;
    }
    if (bytes.byteLength !== target.byteLength) {
      return false;
    }
    for (let i = 0; i < target.byteLength; i++) {
      if (bytes[i] !== target[i]) {
        return false;
      }
    }
    return true;
  }).length;
};

describe('randString', () => {
  describe('length handling', () => {
    it.each([
      [1, 1],
      [16, 16],
      [32, 32],
      [TOKEN_RANDOM_LEN, TOKEN_RANDOM_LEN],
      [64, 64],
      [128, 128],
    ])('returns string of requested length (%i → %i)', (input, expected) => {
      expect(randString(input)).toHaveLength(expected);
    });

    it.each([
      [0, TOKEN_RANDOM_LEN],
      [-1, TOKEN_RANDOM_LEN],
      [-100, TOKEN_RANDOM_LEN],
    ])('clamps non-positive lengths (%i) to default (%i)', (input, expected) => {
      expect(randString(input)).toHaveLength(expected);
    });

    it.each([
      [129, MAX_LEN],
      [500, MAX_LEN],
      [1_000_000, MAX_LEN],
    ])('clamps oversized lengths (%i) to max (%i)', (input, expected) => {
      expect(randString(input)).toHaveLength(expected);
    });
  });

  describe('charset compliance', () => {
    it.each([1, 16, 32, 60, 64, 128])(
      'output at length %i contains only [A-Za-z0-9_]',
      (length) => {
        expect(randString(length)).toMatch(TOKEN_BODY_REGEX);
      },
    );
  });

  describe('uniqueness', () => {
    it('produces no collisions over 10,000 calls', () => {
      const iterations = 10_000;
      const set = new Set<string>();
      for (let i = 0; i < iterations; i++) {
        set.add(randString(TOKEN_RANDOM_LEN));
      }
      expect(set.size).toBe(iterations);
    });
  });

  describe('uniform distribution across charset (10k tokens × 64 chars)', () => {
    const length = 64;
    const tokenCount = 10_000;
    const expectedFreq = (tokenCount * length) / CHARSET.length;
    const margin = expectedFreq * 0.05;
    const lower = expectedFreq - margin;
    const upper = expectedFreq + margin;

    const charCounts: Record<string, number> = Object.fromEntries(CHARSET_ARRAY.map((c) => [c, 0]));

    beforeAll(() => {
      for (let i = 0; i < tokenCount; i++) {
        const t = randString(length);
        for (const c of t) {
          charCounts[c]++;
        }
      }
    });

    it.each(CHARSET_ARRAY)('character "%s" appears within ±5%% of expected frequency', (char) => {
      expect(charCounts[char]).toBeGreaterThanOrEqual(lower);
      expect(charCounts[char]).toBeLessThanOrEqual(upper);
    });
  });
});

describe('generateWpmAuthToken', () => {
  it('returns a token of total length 64 (4 prefix + 60 random)', () => {
    expect(generateWpmAuthToken()).toHaveLength(TOKEN_TOTAL_LEN);
  });

  it('always begins with the "wpm_" prefix', () => {
    expect(generateWpmAuthToken().startsWith(PREFIX)).toBe(true);
  });

  it('random portion is exactly 60 chars from the allowed charset', () => {
    expect(generateWpmAuthToken().slice(PREFIX_LEN)).toMatch(/^[A-Za-z0-9_]{60}$/);
  });

  it.each(Array.from({ length: 50 }, (_, i) => i))(
    'sample #%i matches the full token regex',
    () => {
      expect(generateWpmAuthToken()).toMatch(FULL_WPM_TOKEN_REGEX);
    },
  );

  it('produces no collisions over 10,000 calls', () => {
    const iterations = 10_000;
    const set = new Set<string>();
    for (let i = 0; i < iterations; i++) {
      set.add(generateWpmAuthToken());
    }
    expect(set.size).toBe(iterations);
  });
});

describe('getAuthTokenHash — correctness', () => {
  const hmacKey = 'super_secret_master_key_123!@#';

  it('matches Node native createHmac for a typical token', async () => {
    const token = 'random_generated_token_xyz_789';
    expect(await getAuthTokenHash(token, hmacKey)).toBe(referenceHash(token, hmacKey));
  });

  it('strips the "wpm_" prefix before hashing — prefixed equals raw', async () => {
    const raw = 'my_awesome_token';
    const prefixed = `${PREFIX}${raw}`;

    const rawHash = await getAuthTokenHash(raw, hmacKey);
    const prefixedHash = await getAuthTokenHash(prefixed, hmacKey);

    expect(prefixedHash).toBe(rawHash);
    expect(prefixedHash).toBe(referenceHash(raw, hmacKey));
  });

  it.each([
    ['middle of token', '123_wpm_456'],
    ['suffix only', 'trailing_wpm_'],
    ['no underscore after wpm', 'wpm9_other'],
    ['similar but not equal prefix', 'WPM_uppercase'],
  ])('does NOT strip "wpm_" — case: %s', async (_label, token) => {
    expect(await getAuthTokenHash(token, hmacKey)).toBe(referenceHash(token, hmacKey));
  });

  it('strips ONLY the leading "wpm_" (nested prefix is partly preserved)', async () => {
    const token = 'wpm_wpm_inner';
    expect(await getAuthTokenHash(token, hmacKey)).toBe(referenceHash('wpm_inner', hmacKey));
  });

  it('handles 5KB key with a 128-char token', async () => {
    const massiveToken = randString(128);
    const massiveKey = 'A'.repeat(5000);
    expect(await getAuthTokenHash(massiveToken, massiveKey)).toBe(
      referenceHash(massiveToken, massiveKey),
    );
  });

  describe('output format', () => {
    const samples = Array.from({ length: 100 }, () => randString(64));

    it.each(samples)('returns valid base64url with no padding (sample %#)', async (token) => {
      const hash = await getAuthTokenHash(token, hmacKey);
      expect(hash).toMatch(BASE64URL_REGEX);
      expect(hash).not.toContain('=');
    });

    it('returns 43 chars (HMAC-SHA256 → 32 bytes → ⌈256/6⌉ = 43 base64url chars)', async () => {
      expect(await getAuthTokenHash('any_token', hmacKey)).toHaveLength(43);
    });
  });

  describe('determinism & sensitivity', () => {
    it('is deterministic for identical inputs', async () => {
      const token = 'deterministic_input';
      const a = await getAuthTokenHash(token, hmacKey);
      const b = await getAuthTokenHash(token, hmacKey);
      const c = await getAuthTokenHash(token, hmacKey);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('different tokens with the same key produce different hashes', async () => {
      const a = await getAuthTokenHash('token_alpha', hmacKey);
      const b = await getAuthTokenHash('token_beta', hmacKey);
      expect(a).not.toBe(b);
    });

    it('different keys with the same token produce different hashes', async () => {
      const a = await getAuthTokenHash('shared_token', 'key_alpha');
      const b = await getAuthTokenHash('shared_token', 'key_beta');
      expect(a).not.toBe(b);
    });

    it('a single-byte change in the token changes the hash', async () => {
      const a = await getAuthTokenHash('test_token_a', hmacKey);
      const b = await getAuthTokenHash('test_token_b', hmacKey);
      expect(a).not.toBe(b);
    });
  });
});

describe('getAuthTokenHash — HMAC key cache', () => {
  let importSpy: MockInstance<typeof crypto.subtle.importKey>;

  beforeEach(() => {
    importSpy = vi.spyOn(crypto.subtle, 'importKey');
  });

  afterEach(() => {
    importSpy.mockRestore();
  });

  it('imports the key only once for many sequential calls with the same secret', async () => {
    const secret = uniqueSecret('seq');

    await getAuthTokenHash('t1', secret);
    await getAuthTokenHash('t2', secret);
    await getAuthTokenHash('t3', secret);
    await getAuthTokenHash('t4', secret);

    expect(importKeyCallsForSecret(importSpy, secret)).toBe(1);
  });

  it('shares a single import across concurrent first-callers', async () => {
    const secret = uniqueSecret('concurrent');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => getAuthTokenHash(`token_${i}`, secret)),
    );

    expect(importKeyCallsForSecret(importSpy, secret)).toBe(1);

    results.forEach((hash, i) => {
      expect(hash).toBe(referenceHash(`token_${i}`, secret));
    });
  });

  it('re-imports when called with a different secret', async () => {
    const secretA = uniqueSecret('diff-a');
    const secretB = uniqueSecret('diff-b');

    await getAuthTokenHash('t', secretA);
    await getAuthTokenHash('t', secretB);

    expect(importKeyCallsForSecret(importSpy, secretA)).toBe(1);
    expect(importKeyCallsForSecret(importSpy, secretB)).toBe(1);
  });

  it('produces correct hashes when alternating between two secrets', async () => {
    const secretA = uniqueSecret('alt-a');
    const secretB = uniqueSecret('alt-b');
    const token = 'alternating_token';

    for (let i = 0; i < 5; i++) {
      expect(await getAuthTokenHash(token, secretA)).toBe(referenceHash(token, secretA));
      expect(await getAuthTokenHash(token, secretB)).toBe(referenceHash(token, secretB));
    }
  });

  it('does NOT cache a failed importKey — next call retries successfully', async () => {
    const secret = uniqueSecret('fail');

    importSpy.mockImplementationOnce(() => Promise.reject(new Error('simulated import failure')));

    await expect(getAuthTokenHash('token', secret)).rejects.toThrow('simulated import failure');

    const hash = await getAuthTokenHash('token', secret);

    expect(hash).toBe(referenceHash('token', secret));
  });

  it('passes the correct algorithm and usages to importKey', async () => {
    const secret = uniqueSecret('algo');
    await getAuthTokenHash('t', secret);

    const call = importSpy.mock.calls.find((c) => {
      const fmt = c[0];
      const data = c[1];
      return (
        fmt === 'raw' && data instanceof Uint8Array && new TextDecoder().decode(data) === secret
      );
    });
    expect(call).toBeDefined();

    const [, , algorithm, extractable, usages] = call!;
    expect(algorithm).toEqual({ name: 'HMAC', hash: 'SHA-256' });
    expect(extractable).toBe(false);
    expect(usages).toEqual(['sign']);
  });
});

describe('Property: matches Node native HMAC', () => {
  it.prop([chaoticInputArb], { numRuns: 300 })(
    'matches native HMAC against chaotic inputs',
    async ({ key, token }) => {
      const expectedInput = token.startsWith(PREFIX) ? token.slice(PREFIX_LEN) : token;
      expect(await getAuthTokenHash(token, key)).toBe(referenceHash(expectedInput, key));
    },
  );

  it.each([
    ['empty string', ''],
    ['single space', ' '],
    ['null byte', '\0'],
    ['just the prefix', 'wpm_'],
    ['prefix + control chars', 'wpm_\0\n\r\t'],
    ['emoji', '🤖💩🔥'],
    ['emoji with prefix', 'wpm_🤖💩🔥'],
    ['long ASCII', 'a'.repeat(1024)],
    ['unicode mix', 'naïve_café_日本語_🚀'],
  ])('handles boundary input — %s', async (_label, edgeToken) => {
    const key = 'secure_key';
    const expectedInput = edgeToken.startsWith(PREFIX) ? edgeToken.slice(PREFIX_LEN) : edgeToken;
    expect(await getAuthTokenHash(edgeToken, key)).toBe(referenceHash(expectedInput, key));
  });
});

describe('parseBearerToken', () => {
  const validToken = generateWpmAuthToken();
  const validHeader = `Bearer ${validToken}`;

  describe('accepts', () => {
    it('returns the token from a well-formed Bearer header', () => {
      expect(parseBearerToken(validHeader)).toBe(validToken);
    });

    it.each(Array.from({ length: 20 }, () => generateWpmAuthToken()))(
      'returns the token for fresh sample: %s',
      (token) => {
        expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
      },
    );
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty string', input: '' },
      { case: 'one char shorter than expected', input: `Bearer ${validToken.slice(0, -1)}` },
      { case: 'one char longer than expected', input: `Bearer ${validToken}x` },
      { case: 'missing space after Bearer', input: `Bearer${validToken}` },
      { case: 'lowercase scheme', input: `bearer ${validToken}` },
      { case: 'uppercase scheme', input: `BEARER ${validToken}` },
      { case: 'mixed-case scheme', input: `BeArEr ${validToken}` },
      { case: 'Basic scheme', input: `Basic ${validToken}` },
      { case: 'no scheme, token only', input: validToken.padEnd(71, ' ') },
      { case: 'wrong prefix on token', input: `Bearer abc_${validToken.slice(4)}` },
      { case: 'token uppercase prefix', input: `Bearer WPM_${validToken.slice(4)}` },
      { case: 'token with disallowed char (hyphen)', input: `Bearer wpm_${'-'.repeat(60)}` },
      { case: 'token with disallowed char (space)', input: `Bearer wpm_${' '.repeat(60)}` },
      { case: 'token with non-ASCII char', input: `Bearer wpm_${'é'.repeat(60)}` },
      { case: 'leading whitespace', input: ` Bearer ${validToken}` },
      { case: 'tab instead of space', input: `Bearer\t${validToken}` },
      { case: 'trailing whitespace breaks length', input: `Bearer ${validToken} ` },
    ])('rejects $case', ({ input }) => {
      expect(parseBearerToken(input)).toBeNull();
    });
  });
});
