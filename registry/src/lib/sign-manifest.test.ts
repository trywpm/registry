import { Buffer } from 'node:buffer';

import { fc, it } from '@fast-check/vitest';
import { describe, expect, vi } from 'vitest';

import { canonicalDependencies, signManifest } from './sign-manifest';

import type { Package } from '@wpm/manifest';

const kmsCalls = vi.hoisted(() => ({ messages: [] as Uint8Array[] }));
vi.mock('@wpm/kms', () => ({
  KmsClient: class {
    async sign(args: { Message: Uint8Array }) {
      kmsCalls.messages.push(args.Message);
      return { Signature: new Uint8Array([1, 2, 3]) };
    }
  },
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const env = {
  AWS_REGION: 'auto',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_ENDPOINT_URL: '',
  SIG_KEY_ID: 'test-key',
  SIG_KEY_SPKI_FINGERPRINT: 'sha256:test-fingerprint',
} as unknown as Cloudflare.Env;

const manifest = (dependencies?: Record<string, string>): Package => ({
  name: 'my-plugin',
  type: 'plugin',
  version: '1.4.2',
  tag: 'latest',
  _wpm: '1.0.0',
  visibility: 'public',
  dist: {
    digest: 'sha256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    packedSize: 1024,
    unpackedSize: 4096,
    totalFiles: 3,
    signatures: [],
  },
  dependencies,
});

const signedPayload = async (m: Package): Promise<string> => {
  await signManifest(env, m);
  return new TextDecoder().decode(kmsCalls.messages.at(-1));
};

const BASE = 'my-plugin:1.4.2:sha256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';

describe('signManifest payload', () => {
  it('keeps the 3-field payload when dependencies are absent or empty', async () => {
    await expect(signedPayload(manifest())).resolves.toBe(BASE);
    await expect(signedPayload(manifest({}))).resolves.toBe(BASE);
  });

  it('appends the deps digest for a single dependency', async () => {
    await expect(signedPayload(manifest({ woocommerce: '*' }))).resolves.toBe(
      `${BASE}:obxljuT1Gr+08fI8aVRadBGqQFNKJYhaQ774ODYy9Uc=`,
    );
  });

  it('produces the same payload regardless of dependency insertion order', async () => {
    const expected = `${BASE}:x4qig67B1cXXos+6xEi8+Ie1TLlF39sDRxFekuz+hxI=`;
    await expect(
      signedPayload(manifest({ woocommerce: '*', 'addon-pack': '2.1.0-rc.1' })),
    ).resolves.toBe(expected);
    await expect(
      signedPayload(manifest({ 'addon-pack': '2.1.0-rc.1', woocommerce: '*' })),
    ).resolves.toBe(expected);
  });

  it('sorts hyphenated names by byte order, not locale order', async () => {
    await expect(signedPayload(manifest({ wpa: '1.0.0', 'wp-cli': '2.0.0' }))).resolves.toBe(
      `${BASE}:cNRAyUU1es/oGqKUQNFU3DOJ1uygz2+04DhjJ695SkA=`,
    );
  });

  it('stays far below the KMS raw message limit at schema maximums', async () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 16; i++) {
      deps[`${'a'.repeat(160)}-${i.toString().padStart(3, '0')}`] = `1.0.0-${'x'.repeat(58)}`;
    }

    const payload = await signedPayload(manifest(deps));
    expect(payload.length).toBeLessThan(400);
  });

  it('refuses to sign a payload at or above the KMS limit', async () => {
    const huge = manifest();
    huge.name = 'a'.repeat(5000);
    await expect(signManifest(env, huge)).rejects.toThrow('KMS raw message limit');
  });

  it('attaches the signature and key id to the manifest', async () => {
    const m = manifest({ woocommerce: '*' });
    await signManifest(env, m);

    expect(m.dist.signatures).toEqual([
      {
        sig: Buffer.from([1, 2, 3]).toString('base64'),
        keyid: 'sha256:test-fingerprint',
      },
    ]);
  });
});

// JSON-dangerous + representative characters, so the fuzz actually exercises escaping.
const trickyChar = fc.constantFrom(
  '"',
  '\\',
  '\n',
  '\t',
  '\r',
  '<',
  '>',
  '&',
  '/',
  ' ',
  ':',
  ',',
  '{',
  '}',
  '=',
  'a',
  '0',
  '-',
  'é',
  '🔥',
);
const wild = fc.oneof(
  fc.string(),
  fc.array(trickyChar).map((cs) => cs.join('')),
);
// '__proto__' is excluded so the reference build below is unambiguous.
const wildKey = wild.filter((k) => k !== '__proto__');
const wildEntries = fc.uniqueArray(fc.tuple(wildKey, wild), { selector: ([k]) => k });
const schemaName = fc.stringMatching(/^[a-z0-9-]+$/);
const schemaVersion = fc.stringMatching(/^[a-z0-9.+~^<>=|* -]+$/);
const schemaEntries = fc.uniqueArray(fc.tuple(schemaName, schemaVersion), {
  selector: ([k]) => k,
  maxLength: 32,
});
const reference = (entries: [string, string][]): string =>
  `{${[...entries]
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
    .join(',')}}`;
const goldens: [Record<string, string>, string][] = [
  [{}, '{}'],
  [{ woocommerce: '*' }, '{"woocommerce":"*"}'],
  [
    { woocommerce: '*', 'addon-pack': '2.1.0-rc.1' },
    '{"addon-pack":"2.1.0-rc.1","woocommerce":"*"}',
  ],
  [{ wpa: '1.0.0', 'wp-cli': '2.0.0' }, '{"wp-cli":"2.0.0","wpa":"1.0.0"}'],
  [{ '10': 'x', '2': 'y', '1': 'z' }, '{"1":"z","10":"x","2":"y"}'],
];

describe('canonicalDependencies', () => {
  it.each(goldens)('serializes %o → %s', (deps, expected) => {
    expect(canonicalDependencies(deps)).toBe(expected);
  });

  it('does NOT escape <, >, & (version ranges depend on this)', () => {
    const out = canonicalDependencies({ a: '>=1.0.0', b: '<2.0.0', c: 'x&y' });
    expect(out).toBe('{"a":">=1.0.0","b":"<2.0.0","c":"x&y"}');
    expect(out).not.toMatch(/\\u00(3c|3e|26)/i);
  });

  it('JSON-escapes quotes and backslashes (round-trip-safe)', () => {
    const deps = { 'a"b': 'c\\d' };
    const out = canonicalDependencies(deps);
    expect(out).toBe('{"a\\"b":"c\\\\d"}');
    expect(JSON.parse(out)).toEqual(deps);
  });
});

describe('canonicalDependencies invariants', () => {
  it.prop([wildEntries], { numRuns: 1000 })(
    'matches the canonicalization spec for ANY input',
    (entries) => {
      expect(canonicalDependencies(Object.fromEntries(entries))).toBe(reference(entries));
    },
  );

  it.prop([wildEntries], { numRuns: 500 })('is independent of key insertion order', (entries) => {
    const forward = canonicalDependencies(Object.fromEntries(entries));
    const reversed = canonicalDependencies(Object.fromEntries([...entries].toReversed()));
    expect(reversed).toBe(forward);
  });

  it.prop([schemaEntries], { numRuns: 500 })(
    'emits zero escape sequences for schema-valid inputs',
    (entries) => {
      expect(canonicalDependencies(Object.fromEntries(entries))).not.toContain('\\');
    },
  );
});
