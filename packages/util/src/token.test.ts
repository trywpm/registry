import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';

import { generateBearerToken, generateBearerTokenHash } from './token';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
const CHARSET_ARRAY = Array.from({ length: CHARSET.length }, (_, i) => CHARSET[i]);

const referenceHash = (token: string, key: string) => {
  return createHmac('sha256', key).update(token).digest('base64url');
};

const generateChaosString = (maxLength: number) => {
  const length = Math.floor(Math.random() * maxLength) + 1;
  return Array.from({ length }, () => String.fromCharCode(Math.floor(Math.random() * 65535))).join(
    '',
  );
};

describe('generateBearerToken', () => {
  it('generates a string of default length 64', () => {
    expect(generateBearerToken()).toHaveLength(64);
  });

  it('generates a string of requested length', () => {
    expect(generateBearerToken(32)).toHaveLength(32);
    expect(generateBearerToken(128)).toHaveLength(128);
  });

  it.each([
    [0, 64],
    [-1, 64],
    [-100, 64],
  ])('clamps invalid small lengths (%i) to exactly %i', (input, expected) => {
    expect(generateBearerToken(input)).toHaveLength(expected);
  });

  it.each([
    [129, 128],
    [500, 128],
  ])('clamps excessively large lengths (%i) to maximum %i', (input, expected) => {
    expect(generateBearerToken(input)).toHaveLength(expected);
  });

  it('contains ONLY characters from the allowed 63-character charset', () => {
    expect(generateBearerToken(128)).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('guarantees collision resistance over 10,000 iterations', () => {
    const ITERATIONS = 10_000;
    const tokens = new Set(Array.from({ length: ITERATIONS }, () => generateBearerToken(64)));

    expect(tokens.size).toBe(ITERATIONS);
  });

  describe('Uniform Entropy (Statistical Test)', () => {
    const charCounts: Record<string, number> = Object.fromEntries(CHARSET_ARRAY.map((c) => [c, 0]));

    const length = 64;
    const tokenCount = 10_000;
    const totalChars = tokenCount * length;

    const expectedFrequency = totalChars / CHARSET.length;
    const margin = expectedFrequency * 0.05;
    const lowerBound = expectedFrequency - margin;
    const upperBound = expectedFrequency + margin;

    beforeAll(() => {
      Array.from({ length: tokenCount }).forEach(() => {
        const token = generateBearerToken(length);
        for (const char of token) {
          charCounts[char]++;
        }
      });
    });

    it.each(CHARSET_ARRAY)('character "%s" appears within uniform distribution bounds', (char) => {
      expect(charCounts[char]).toBeGreaterThanOrEqual(lowerBound);
      expect(charCounts[char]).toBeLessThanOrEqual(upperBound);
    });
  });
});

describe('generateBearerTokenHash', () => {
  const hmacKey = 'super_secret_master_key_123!@#';

  it('matches exactly with Node.js native createHmac (Reference Comparison)', async () => {
    const token = 'random_generated_token_xyz_789';

    const workerHash = await generateBearerTokenHash(token, hmacKey);
    const truthHash = referenceHash(token, hmacKey);

    expect(workerHash).toStrictEqual(truthHash);
  });

  it('correctly strips the "wpm_" prefix before hashing', async () => {
    const rawToken = 'my_awesome_token';
    const prefixedToken = `wpm_${rawToken}`;

    const rawHash = await generateBearerTokenHash(rawToken, hmacKey);
    const prefixedHash = await generateBearerTokenHash(prefixedToken, hmacKey);

    expect(prefixedHash).toStrictEqual(rawHash);
    expect(prefixedHash).toStrictEqual(referenceHash(rawToken, hmacKey));
  });

  it('does NOT strip "wpm_" if it appears in the middle of the token', async () => {
    const token = '123_wpm_456';

    const hash = await generateBearerTokenHash(token, hmacKey);
    const truthHash = referenceHash(token, hmacKey);

    expect(hash).toStrictEqual(truthHash);
  });

  const randomTokens = Array.from({ length: 100 }, () => generateBearerToken(64));

  it.each(randomTokens)(
    'returns valid URL-safe Base64 without padding characters (test %#)',
    async (token) => {
      const hash = await generateBearerTokenHash(token, hmacKey);
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    },
  );

  it('handles extremely large keys and tokens gracefully', async () => {
    const massiveToken = generateBearerToken(128);
    const massiveKey = 'A'.repeat(5000);

    const workerHash = await generateBearerTokenHash(massiveToken, massiveKey);
    const truthHash = referenceHash(massiveToken, massiveKey);

    expect(workerHash).toStrictEqual(truthHash);
  });
});

describe('Fuzz Testing: Chaos Inputs vs Native Hash', () => {
  const chaoticInputs = Array.from({ length: 1000 }, () => {
    const key = generateChaosString(100);
    const tokenBase = generateChaosString(200);
    const token = Math.random() > 0.5 ? `wpm_${tokenBase}` : tokenBase;

    return { key, token };
  });

  it.each(chaoticInputs)(
    'matches Native Hash against chaotic combination %#',
    async ({ key, token }) => {
      const workerHash = await generateBearerTokenHash(token, key);

      const referenceInput = token.startsWith('wpm_') ? token.slice(4) : token;
      const truthHash = referenceHash(referenceInput, key);

      expect(workerHash).toStrictEqual(truthHash);
    },
  );

  const edgeCases = ['', ' ', '\0', 'wpm_', 'wpm_\0\n\r\t', '🤖💩🔥'];

  it.each(edgeCases)('handles boundary input without crashing: "%s"', async (edgeToken) => {
    const key = 'secure_key';
    const workerHash = await generateBearerTokenHash(edgeToken, key);

    const referenceInput = edgeToken.startsWith('wpm_') ? edgeToken.slice(4) : edgeToken;
    const truthHash = referenceHash(referenceInput, key);

    expect(workerHash).toStrictEqual(truthHash);
  });
});
