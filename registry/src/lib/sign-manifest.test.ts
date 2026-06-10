import { Buffer } from 'node:buffer';

import { describe, it, expect, vi } from 'vitest';

import { signManifest } from './sign-manifest';

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
