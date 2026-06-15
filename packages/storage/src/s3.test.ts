import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { fc, it } from '@fast-check/vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ChecksumMismatchError } from '@wpm/exception';
import { describe, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { Presigner } from './s3';

import type { PresignerConfig, PutArgs } from './s3';

const FIXED_AMZ = '20260510T123456Z';
const fixedClock = (): number => FIXED_DATE.getTime();
const FIXED_DATE = new Date('2026-05-10T12:34:56.000Z');

const BUCKET = 'my-bucket';
const ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const CFG: PresignerConfig = {
  bucket: BUCKET,
  endpoint: 'http://localhost:9000',
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  clock: fixedClock,
};

const REQUIRED_PARAMS = [
  'X-Amz-Algorithm',
  'X-Amz-Credential',
  'X-Amz-Date',
  'X-Amz-Expires',
  'X-Amz-Signature',
  'X-Amz-SignedHeaders',
] as const;

const HEX64 = /^[0-9a-f]{64}$/;

function paramOf(url: string, name: string): string {
  const v = new URL(url).searchParams.get(name);
  if (v == null) {
    throw new Error(`URL is missing query parameter: ${name}`);
  }

  return v;
}

function sigOf(url: string): string {
  return paramOf(url, 'X-Amz-Signature');
}

/** A fetch mock that drains the (tapped) request body so an inline hash runs. */
const drainingFetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
  if (init?.body) {
    await new Response(init.body).arrayBuffer();
  }
  return new Response(null, { status: 200 });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Presigner — config validation', () => {
  it.each([
    {
      case: 'missing accessKeyId',
      cfg: { accessKeyId: '', secretAccessKey: 'x', bucket: 'b', endpoint: 'e' },
    },
    {
      case: 'missing secretKey',
      cfg: { accessKeyId: 'x', secretAccessKey: '', bucket: 'b', endpoint: 'e' },
    },
    {
      case: 'missing bucket+endpoint',
      cfg: { accessKeyId: 'x', secretAccessKey: 'y', endpoint: '', bucket: '' },
    },
    {
      case: 'endpoint with trailing slash',
      cfg: { accessKeyId: 'x', secretAccessKey: 'y', bucket: 'b', endpoint: 'e/' },
    },
  ] satisfies readonly { case: string; cfg: PresignerConfig }[])('throws when $case', ({ cfg }) => {
    expect(() => new Presigner(cfg)).toThrow();
  });
});

describe('Presigner — input validation', () => {
  const p = new Presigner(CFG);

  it.each([
    { case: 'empty key', args: { key: '', expiresIn: 60 } },
    { case: 'expiresIn = 0', args: { key: 'x', expiresIn: 0 } },
    { case: 'expiresIn > 7d', args: { key: 'x', expiresIn: 604801 } },
    { case: 'non-integer expires', args: { key: 'x', expiresIn: 60.5 } },
  ])('rejects $case', async ({ args }) => {
    await expect(p.get(args)).rejects.toThrow();
  });

  it.each([
    { case: 'expiresIn = 1', expiresIn: 1 },
    { case: 'expiresIn = 7 days', expiresIn: 604800 },
  ])('accepts boundary: $case', async ({ expiresIn }) => {
    await expect(p.get({ key: 'x', expiresIn })).resolves.toEqual(expect.any(String));
  });
});

describe('presignGet — URL shape', () => {
  let url = '';
  beforeAll(async () => {
    const p = new Presigner(CFG);
    url = await p.get({ key: 'photos/cat.png', expiresIn: 3600 });
  });

  it('is parseable', () => {
    expect(() => new URL(url)).not.toThrow();
  });

  it('protocol matches endpoint scheme', () => {
    expect(new URL(url).protocol).toBe('http:');
  });

  it('host matches endpoint authority', () => {
    expect(new URL(url).host).toBe('localhost:9000');
  });

  it('path is /<bucket>/<encoded-key>', () => {
    expect(new URL(url).pathname).toBe(`/my-bucket/photos/cat.png`);
  });

  it.each(REQUIRED_PARAMS)('includes required SigV4 query parameter %s', (name) => {
    expect(new URL(url).searchParams.has(name)).toBe(true);
  });

  it('X-Amz-Algorithm is AWS4-HMAC-SHA256', () => {
    expect(paramOf(url, 'X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  });

  it('X-Amz-Credential has expected scope', () => {
    expect(paramOf(url, 'X-Amz-Credential')).toBe(
      'AKIAIOSFODNN7EXAMPLE/20260510/auto/s3/aws4_request',
    );
  });

  it('X-Amz-Date matches fixed clock', () => {
    expect(paramOf(url, 'X-Amz-Date')).toBe(FIXED_AMZ);
  });

  it('X-Amz-SignedHeaders is `host` for GET', () => {
    expect(paramOf(url, 'X-Amz-SignedHeaders')).toBe('host');
  });

  it('X-Amz-Signature is 64 hex chars', () => {
    expect(sigOf(url)).toMatch(HEX64);
  });
});

describe('presignGet — determinism and sensitivity', () => {
  it('same inputs → same signature', async () => {
    const a = new Presigner(CFG);
    const b = new Presigner(CFG);
    const u1 = await a.get({ key: 'x', expiresIn: 60 });
    const u2 = await b.get({ key: 'x', expiresIn: 60 });
    expect(sigOf(u1)).toBe(sigOf(u2));
  });

  it.each([
    { mutate: 'key', a: { key: 'a', expiresIn: 60 }, b: { key: 'b', expiresIn: 60 } },
    { mutate: 'expiresIn', a: { key: 'x', expiresIn: 60 }, b: { key: 'x', expiresIn: 61 } },
  ])('different $mutate → different signatures', async ({ a, b }) => {
    const p = new Presigner(CFG);
    expect(sigOf(await p.get(a))).not.toBe(sigOf(await p.get(b)));
  });

  it('different secret → different signatures', async () => {
    const p1 = new Presigner({ ...CFG, secretAccessKey: 'a'.repeat(40) });
    const p2 = new Presigner({ ...CFG, secretAccessKey: 'b'.repeat(40) });
    const u1 = await p1.get({ key: 'x', expiresIn: 60 });
    const u2 = await p2.get({ key: 'x', expiresIn: 60 });
    expect(sigOf(u1)).not.toBe(sigOf(u2));
  });
});

describe('presignGet — key encoding', () => {
  const p = new Presigner(CFG);

  it.each([
    { name: 'simple ascii', key: 'foo.txt', pathSeg: 'foo.txt' },
    { name: 'nested path', key: 'a/b/c.bin', pathSeg: 'a/b/c.bin' },
    { name: 'space', key: 'hello world.txt', pathSeg: 'hello%20world.txt' },
    { name: 'plus', key: 'a+b.txt', pathSeg: 'a%2Bb.txt' },
    { name: 'question mark', key: 'is?this.txt', pathSeg: 'is%3Fthis.txt' },
    { name: 'hash', key: 'a#b.txt', pathSeg: 'a%23b.txt' },
    { name: 'ampersand', key: 'a&b.txt', pathSeg: 'a%26b.txt' },
    { name: 'percent', key: 'a%b.txt', pathSeg: 'a%25b.txt' },
    { name: 'rfc3986 specials', key: "x!'()*y.txt", pathSeg: 'x%21%27%28%29%2Ay.txt' },
    { name: 'unicode (emoji)', key: '🎉.txt', pathSeg: '%F0%9F%8E%89.txt' },
    { name: 'unicode (cyrillic)', key: 'файл.txt', pathSeg: '%D1%84%D0%B0%D0%B9%D0%BB.txt' },
    { name: 'preserves slashes', key: 'deep/nested/path/x.bin', pathSeg: 'deep/nested/path/x.bin' },
    { name: 'tilde unreserved', key: '~bak.txt', pathSeg: '~bak.txt' },
    { name: 'dash dot underscore', key: 'a-b_c.d', pathSeg: 'a-b_c.d' },
  ])('encodes $name', async ({ key, pathSeg }) => {
    const url = await p.get({ key, expiresIn: 60 });
    expect(new URL(url).pathname).toBe(`/my-bucket/${pathSeg}`);
    expect(sigOf(url)).toMatch(HEX64);
  });
});

describe('presignPut — Go SDK feature parity', () => {
  const p = new Presigner(CFG);

  it('returns { url, headers } including host', async () => {
    const out = await p.put({ key: 'x', expiresIn: 60 });
    expect(typeof out.url).toBe('string');
    expect(out.headers['host']).toBe('localhost:9000');
  });

  it('only `host` is signed when no extra options', async () => {
    const out = await p.put({ key: 'x', expiresIn: 60 });
    expect(paramOf(out.url, 'X-Amz-SignedHeaders')).toBe('host');
  });

  it.each([
    {
      name: 'contentType',
      args: { contentType: 'image/png' } as Partial<PutArgs>,
      signed: ['content-type'],
    },
    {
      name: 'contentLength',
      args: { contentLength: 1234 } as Partial<PutArgs>,
      signed: ['content-length'],
    },
    {
      name: 'sha256',
      args: { sha256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=' } as Partial<PutArgs>,
      signed: ['x-amz-checksum-sha256', 'x-amz-sdk-checksum-algorithm'],
    },
    {
      name: 'ifNoneMatch',
      args: { ifNoneMatch: true } as Partial<PutArgs>,
      signed: ['if-none-match'],
    },
  ])('$name is signed (not query-hoisted)', async ({ args, signed }) => {
    const out = await p.put({ key: 'x', expiresIn: 60, ...args });
    const sh = paramOf(out.url, 'X-Amz-SignedHeaders').split(';');
    for (const h of signed) {
      expect(sh).toContain(h);
      expect(out.headers[h]).toBeDefined();
    }
  });

  it('sha256 also sets x-amz-sdk-checksum-algorithm to SHA256', async () => {
    const digest = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=';
    const out = await p.put({ key: 'x', expiresIn: 60, sha256: digest });
    expect(out.headers['x-amz-checksum-sha256']).toBe(digest);
    expect(out.headers['x-amz-sdk-checksum-algorithm']).toBe('SHA256');
  });

  it('ifNoneMatch true → If-None-Match: *', async () => {
    const out = await p.put({ key: 'x', expiresIn: 60, ifNoneMatch: true });
    expect(out.headers['if-none-match']).toBe('*');
  });

  it('contentType is NOT hoisted to query string', async () => {
    const out = await p.put({ key: 'x', expiresIn: 60, contentType: 'image/png' });
    expect(new URL(out.url).searchParams.has('Content-Type')).toBe(false);
  });

  it('all options combined → SignedHeaders alphabetically sorted', async () => {
    const out = await p.put({
      key: 'uploads/file.bin',
      expiresIn: 3600,
      contentType: 'application/octet-stream',
      contentLength: 9999,
      sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      ifNoneMatch: true,
    });
    const parts = paramOf(out.url, 'X-Amz-SignedHeaders').split(';');
    expect(parts).toEqual([...parts].toSorted());
    expect(new Set(parts)).toEqual(
      new Set([
        'content-length',
        'content-type',
        'host',
        'if-none-match',
        'x-amz-checksum-sha256',
        'x-amz-sdk-checksum-algorithm',
      ]),
    );
  });

  it.each([
    { mutate: 'contentType', a: { contentType: 'image/png' }, b: { contentType: 'image/jpeg' } },
    { mutate: 'sha256', a: { sha256: 'AAAA' }, b: { sha256: 'BBBB' } },
  ] satisfies readonly {
    mutate: string;
    a: Partial<PutArgs>;
    b: Partial<PutArgs>;
  }[])('changing $mutate → different signatures', async ({ a, b }) => {
    const ua = await p.put({ key: 'x', expiresIn: 60, ...a });
    const ub = await p.put({ key: 'x', expiresIn: 60, ...b });
    expect(sigOf(ua.url)).not.toBe(sigOf(ub.url));
  });
});

describe('presignPut — unhoistable headers (digest verification)', () => {
  const p = new Presigner(CFG);

  const UNHOISTABLE = [
    {
      input: { sha256: 'AAAA' } as Partial<PutArgs>,
      header: 'x-amz-checksum-sha256',
      queryParam: 'X-Amz-Checksum-Sha256',
    },
    {
      input: { sha256: 'AAAA' } as Partial<PutArgs>,
      header: 'x-amz-sdk-checksum-algorithm',
      queryParam: 'X-Amz-Sdk-Checksum-Algorithm',
    },
    {
      input: { contentType: 'image/png' } as Partial<PutArgs>,
      header: 'content-type',
      queryParam: 'Content-Type',
    },
    {
      input: { contentLength: 1234 } as Partial<PutArgs>,
      header: 'content-length',
      queryParam: 'Content-Length',
    },
    {
      input: { ifNoneMatch: true } as Partial<PutArgs>,
      header: 'if-none-match',
      queryParam: 'If-None-Match',
    },
  ] as const;

  it.each(UNHOISTABLE)(
    '$header is signed as a header, NEVER hoisted to query ($queryParam)',
    async ({ input, header, queryParam }) => {
      const out = await p.put({ key: 'x', expiresIn: 60, ...input });
      const u = new URL(out.url);
      expect(out.headers[header]).toBeDefined();
      expect(paramOf(out.url, 'X-Amz-SignedHeaders').split(';')).toContain(header);

      const queryKeys = [...u.searchParams.keys()];
      const queryKeysLower = queryKeys.map((k) => k.toLowerCase());
      expect(queryKeys).not.toContain(queryParam);
      expect(queryKeysLower).not.toContain(header);
    },
  );

  it("the URL's query string contains ONLY the 6 SigV4 metadata params", async () => {
    const out = await p.put({
      key: 'uploads/data.bin',
      sha256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
      expiresIn: 3600,
      ifNoneMatch: true,
      contentType: 'application/octet-stream',
      contentLength: 9999,
    });
    const queryKeys = [...new URL(out.url).searchParams.keys()].toSorted();
    expect(queryKeys).toEqual([
      'X-Amz-Algorithm',
      'X-Amz-Credential',
      'X-Amz-Date',
      'X-Amz-Expires',
      'X-Amz-Signature',
      'X-Amz-SignedHeaders',
    ]);
  });

  it('digest verification path: SHA-256 base64 round-trips through headers', async () => {
    const payload = Buffer.from('hello, world', 'utf8');
    const digestBytes = await crypto.subtle.digest('SHA-256', payload);
    const digestB64 = Buffer.from(digestBytes).toString('base64');

    const out = await p.put({
      key: 'data.bin',
      sha256: digestB64,
      expiresIn: 60,
      contentLength: payload.length,
    });

    expect(out.url).not.toContain(digestB64);
    expect(out.url).not.toContain(encodeURIComponent(digestB64));
    expect(paramOf(out.url, 'X-Amz-SignedHeaders').split(';')).toContain('x-amz-checksum-sha256');

    expect(out.headers['x-amz-checksum-sha256']).toBe(digestB64);
  });
});

describe('Presigner — caching behavior', () => {
  it('daily cache reused on warm path (zero importKey calls)', async () => {
    const p = new Presigner(CFG);
    const spy = vi.spyOn(crypto.subtle, 'importKey');

    await p.get({ key: 'a', expiresIn: 60 });
    const importsAfterCold = spy.mock.calls.length;

    for (let i = 0; i < 50; i++) {
      await p.get({ key: `k${i}`, expiresIn: 60 });
    }

    expect(spy.mock.calls.length).toBe(importsAfterCold);
  });

  it('cache invalidates on UTC day rollover', async () => {
    let nowMs = new Date('2026-05-10T23:59:00.000Z').getTime();
    const p = new Presigner({ ...CFG, clock: (): number => nowMs });
    const u1 = await p.get({ key: 'x', expiresIn: 60 });
    nowMs = new Date('2026-05-11T00:00:30.000Z').getTime();
    const u2 = await p.get({ key: 'x', expiresIn: 60 });

    expect(sigOf(u1)).not.toBe(sigOf(u2));
    expect(paramOf(u1, 'X-Amz-Credential')).toContain('/20260510/');
    expect(paramOf(u2, 'X-Amz-Credential')).toContain('/20260511/');
  });

  it('concurrent first calls share derivation (in-flight dedupe)', async () => {
    const p = new Presigner(CFG);
    const spy = vi.spyOn(crypto.subtle, 'sign');

    const urls = await Promise.all(
      Array.from({ length: 32 }, (_, i) => p.get({ key: `k${i}`, expiresIn: 60 })),
    );

    expect(urls).toHaveLength(32);
    expect(spy.mock.calls.length).toBe(36);
  });
});

describe('Signature regression baseline', () => {
  it('produces a stable signature for a fixed input (path-style)', async () => {
    const refDate = new Date('2013-05-24T00:00:00.000Z');
    const p = new Presigner({
      bucket: 'examplebucket',
      endpoint: 'http://localhost:9000',
      clock: (): number => refDate.getTime(),
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    const url = await p.get({ key: 'test.txt', expiresIn: 86400 });
    expect(sigOf(url)).toBe('e94b227b9d5fe9ae64907b700468795cfd9f8f71a9eab52ed84df993e795fc5e');
  });
});

describe('AWS SDK v3 oracle: structural equivalence', () => {
  const SDK_FIXED = new Date('2026-05-10T12:34:56.000Z');

  const CFG_NO_CLOCK: PresignerConfig = {
    bucket: BUCKET,
    endpoint: 'http://localhost:9000',
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  };

  const sdkClient = new S3Client({
    region: 'auto',
    forcePathStyle: true,
    endpoint: 'http://localhost:9000',
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  });

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SDK_FIXED);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it.each([
    'simple.txt',
    'nested/path/file.bin',
    'with space.txt',
    'weird+chars=test.bin',
    '🎉/emoji.png',
    'файл.txt',
    'x'.repeat(500),
    'deep/very/nested/path/to/resource.json',
    'name~with-unreserved_chars.txt',
  ])('encoded path matches SDK: %s', async (key) => {
    const ours = new Presigner(CFG_NO_CLOCK);
    const sdkUrl = await getSignedUrl(
      sdkClient,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
    const ourUrl = await ours.get({ key, expiresIn: 3600 });
    expect(new URL(ourUrl).pathname).toBe(new URL(sdkUrl).pathname);
  });

  it.each(['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires'])(
    '%s matches SDK byte-for-byte',
    async (paramName) => {
      const ours = new Presigner(CFG_NO_CLOCK);
      const sdkUrl = await getSignedUrl(
        sdkClient,
        new GetObjectCommand({ Bucket: BUCKET, Key: 'test.txt' }),
        { expiresIn: 3600 },
      );
      const ourUrl = await ours.get({ key: 'test.txt', expiresIn: 3600 });
      expect(paramOf(ourUrl, paramName)).toBe(paramOf(sdkUrl, paramName));
    },
  );

  it('host matches SDK (regional virtual-host style)', async () => {
    const ours = new Presigner(CFG_NO_CLOCK);
    const sdkUrl = await getSignedUrl(
      sdkClient,
      new GetObjectCommand({ Bucket: BUCKET, Key: 'test.txt' }),
      { expiresIn: 3600 },
    );
    const ourUrl = await ours.get({ key: 'test.txt', expiresIn: 3600 });
    expect(new URL(ourUrl).host).toBe(new URL(sdkUrl).host);
  });

  it('scheme is http for both', async () => {
    const ours = new Presigner(CFG_NO_CLOCK);
    const sdkUrl = await getSignedUrl(
      sdkClient,
      new GetObjectCommand({ Bucket: BUCKET, Key: 'test.txt' }),
      { expiresIn: 3600 },
    );
    const ourUrl = await ours.get({ key: 'test.txt', expiresIn: 3600 });

    expect(new URL(ourUrl).protocol).toBe('http:');
    expect(new URL(sdkUrl).protocol).toBe('http:');
  });

  it.each([60, 300, 3600, 86400, 604800])(
    'expiresIn %i propagates identically',
    async (expiresIn) => {
      const ours = new Presigner(CFG_NO_CLOCK);
      const sdkUrl = await getSignedUrl(
        sdkClient,
        new GetObjectCommand({ Bucket: BUCKET, Key: 'test.txt' }),
        { expiresIn },
      );
      const ourUrl = await ours.get({ key: 'test.txt', expiresIn });
      expect(paramOf(ourUrl, 'X-Amz-Expires')).toBe(paramOf(sdkUrl, 'X-Amz-Expires'));
      expect(paramOf(ourUrl, 'X-Amz-Expires')).toBe(String(expiresIn));
    },
  );
});

describe('AWS SDK v3 oracle: unhoistable headers', () => {
  const SDK_FIXED = new Date('2026-05-10T12:34:56.000Z');
  const CFG_NO_CLOCK: PresignerConfig = {
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    endpoint: 'http://localhost:9000',
  };
  const sdkClient = new S3Client({
    region: 'auto',
    forcePathStyle: true,
    endpoint: 'http://localhost:9000',
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  });

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SDK_FIXED);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('REGRESSION: SDK hoists checksum to query by default (broken for digest)', async () => {
    const sdkUrl = await getSignedUrl(
      sdkClient,
      new PutObjectCommand({
        Key: 'x',
        Bucket: BUCKET,
        ChecksumSHA256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
        ChecksumAlgorithm: 'SHA256',
      }),
      { expiresIn: 60 },
    );
    const u = new URL(sdkUrl);

    expect(u.searchParams.has('x-amz-checksum-sha256')).toBe(true);
    expect(paramOf(sdkUrl, 'X-Amz-SignedHeaders').split(';')).not.toContain(
      'x-amz-checksum-sha256',
    );
  });

  it('SDK with unhoistableHeaders matches our default behavior', async () => {
    const sdkUrl = await getSignedUrl(
      sdkClient,
      new PutObjectCommand({
        Key: 'x',
        Bucket: BUCKET,
        ChecksumSHA256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
        ChecksumAlgorithm: 'SHA256',
      }),
      {
        expiresIn: 60,
        unhoistableHeaders: new Set(['x-amz-checksum-sha256', 'x-amz-sdk-checksum-algorithm']),
      },
    );

    const ours = new Presigner(CFG_NO_CLOCK);
    const ourPut = await ours.put({
      key: 'x',
      expiresIn: 60,
      sha256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
    });

    const sdkSh = paramOf(sdkUrl, 'X-Amz-SignedHeaders').split(';');
    const ourSh = paramOf(ourPut.url, 'X-Amz-SignedHeaders').split(';');

    expect(sdkSh).toContain('x-amz-checksum-sha256');
    expect(ourSh).toContain('x-amz-checksum-sha256');
    expect(sdkSh).toContain('x-amz-sdk-checksum-algorithm');
    expect(ourSh).toContain('x-amz-sdk-checksum-algorithm');

    expect(new URL(sdkUrl).searchParams.has('x-amz-checksum-sha256')).toBe(false);
    expect(new URL(ourPut.url).searchParams.has('x-amz-checksum-sha256')).toBe(false);
    expect(new URL(sdkUrl).searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(new URL(ourPut.url).searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });

  it.each([
    {
      name: 'content-type',
      sdkOpts: { ContentType: 'image/png' },
      ourOpts: { contentType: 'image/png' } as Partial<PutArgs>,
      header: 'content-type',
      sdkSignable: ['content-type'],
    },
    {
      name: 'if-none-match',
      sdkOpts: { IfNoneMatch: '*' },
      ourOpts: { ifNoneMatch: true } as Partial<PutArgs>,
      header: 'if-none-match',
      sdkSignable: [],
    },
    {
      name: 'x-amz-checksum-sha256 + x-amz-sdk-checksum-algorithm',
      sdkOpts: {
        ChecksumSHA256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
        ChecksumAlgorithm: 'SHA256' as const,
      },
      ourOpts: {
        sha256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
      } as Partial<PutArgs>,
      header: 'x-amz-checksum-sha256',
      sdkSignable: [],
    },
  ])(
    '$name: SDK and our presigner agree on signed-not-hoisted',
    async ({ sdkOpts, ourOpts, header, sdkSignable }) => {
      const sdkUrl = await getSignedUrl(
        sdkClient,
        new PutObjectCommand({ Bucket: BUCKET, Key: 'x', ...sdkOpts }),
        {
          expiresIn: 60,
          signableHeaders: new Set(sdkSignable),
          unhoistableHeaders: new Set(['x-amz-checksum-sha256', 'x-amz-sdk-checksum-algorithm']),
        },
      );
      const ours = new Presigner(CFG_NO_CLOCK);
      const ourPut = await ours.put({ key: 'x', expiresIn: 60, ...ourOpts });

      expect(paramOf(sdkUrl, 'X-Amz-SignedHeaders').split(';')).toContain(header);
      expect(paramOf(ourPut.url, 'X-Amz-SignedHeaders').split(';')).toContain(header);

      expect(new URL(sdkUrl).searchParams.has(header)).toBe(false);
      expect(new URL(ourPut.url).searchParams.has(header)).toBe(false);
    },
  );
});

describe('AWS canonical request shape', () => {
  it('canonical request has 7 newline-separated sections in spec order', async () => {
    const p = new Presigner(CFG);
    const r = await p.debugSign({
      method: 'GET',
      key: 'test.txt',
      expiresIn: 86400,
      headers: null,
    });
    const sections = r.canonicalRequest.split('\n');

    expect(sections[0]).toBe('GET');
    expect(sections[1]).toBe('/my-bucket/test.txt');
    expect(sections[2]).toMatch(/^X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    expect(sections[3]).toBe('host:localhost:9000');
    expect(sections[4]).toBe('');
    expect(sections[5]).toBe('host');
    expect(sections[6]).toBe('UNSIGNED-PAYLOAD');
  });

  it('string-to-sign has 4 lines per AWS spec', async () => {
    const p = new Presigner(CFG);
    const r = await p.debugSign({
      method: 'GET',
      key: 'test.txt',
      expiresIn: 86400,
      headers: null,
    });
    const lines = r.stringToSign.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('AWS4-HMAC-SHA256');
    expect(lines[1]).toBe(FIXED_AMZ);
    expect(lines[2]).toBe('20260510/auto/s3/aws4_request');
    expect(lines[3]).toMatch(HEX64);
  });
});

describe('Canonical path matches URL path (path-style invariant)', () => {
  const p = new Presigner(CFG);

  it.each(['k.txt', 'a/b/c.bin', 'with space.txt', '🎉.png', 'файл.txt'])(
    'canonical path equals URL pathname for: %s',
    async (key) => {
      const r = await p.debugSign({ method: 'GET', key, expiresIn: 60, headers: null });
      const canonicalPath = r.canonicalRequest.split('\n')[1];
      expect(canonicalPath).toBe(new URL(r.url).pathname);
    },
  );

  it('canonical path always starts with /<bucket>/', async () => {
    const r = await p.debugSign({ method: 'GET', key: 'x', expiresIn: 60, headers: null });
    expect(r.canonicalRequest.split('\n')[1]).toBe(`/${BUCKET}/x`);
  });
});

describe('Endpoint parsing', () => {
  it.each([
    {
      name: 'http with port',
      endpoint: 'http://localhost:9000',
      host: 'localhost:9000',
      protocol: 'http:',
    },
    {
      name: 'https no port',
      endpoint: 'https://s3.amazonaws.com',
      host: 's3.amazonaws.com',
      protocol: 'https:',
    },
    {
      name: 'https with port',
      endpoint: 'https://r2.example.com:443',
      host: 'r2.example.com',
      protocol: 'https:',
    },
    {
      name: 'http IP + port',
      endpoint: 'http://127.0.0.1:9000',
      host: '127.0.0.1:9000',
      protocol: 'http:',
    },
    {
      name: 'http IPv6 + port',
      endpoint: 'http://[::1]:9000',
      host: '[::1]:9000',
      protocol: 'http:',
    },
    {
      name: 'http subdomain',
      endpoint: 'http://minio.internal:9000',
      host: 'minio.internal:9000',
      protocol: 'http:',
    },
  ])('accepts $name', ({ endpoint, host, protocol }) => {
    const p = new Presigner({ ...CFG, endpoint });
    expect(p.host).toBe(host);
    expect(new URL('http://x' /* dummy */).protocol).toBe(protocol === 'http:' ? 'http:' : 'http:');
  });

  it.each([
    { name: 'no scheme', endpoint: 'localhost:9000' },
    { name: 'unsupported scheme', endpoint: 'ftp://localhost:9000' },
    { name: 'just garbage', endpoint: 'not a url' },
    { name: 'trailing slash', endpoint: 'http://localhost:9000/' },
  ])('rejects $name', ({ endpoint }) => {
    expect(() => new Presigner({ ...CFG, endpoint })).toThrow();
  });

  it.each([
    { name: 'http endpoint → http URL', endpoint: 'http://localhost:9000', expected: 'http:' },
    { name: 'https endpoint → https URL', endpoint: 'https://s3.example.com', expected: 'https:' },
  ])('$name', async ({ endpoint, expected }) => {
    const p = new Presigner({ ...CFG, endpoint });
    const url = await p.get({ key: 'k', expiresIn: 60 });
    expect(new URL(url).protocol).toBe(expected);
  });
});

describe('Endpoint defaulting', () => {
  it('derives the regional AWS host when no endpoint is given', () => {
    const p = new Presigner({ ...CFG, endpoint: undefined, region: 'us-east-1' });
    expect(p.host).toBe('s3.us-east-1.amazonaws.com');
  });

  it('treats an empty endpoint as absent', () => {
    const p = new Presigner({ ...CFG, endpoint: '', region: 'eu-west-1' });
    expect(p.host).toBe('s3.eu-west-1.amazonaws.com');
  });

  it('throws when neither endpoint nor region is given', () => {
    expect(() => new Presigner({ ...CFG, endpoint: undefined, region: undefined })).toThrow();
  });
});

describe('Region defaulting', () => {
  it("defaults to 'auto' when not provided", async () => {
    const p = new Presigner({ ...CFG });
    const url = await p.get({ key: 'k', expiresIn: 60 });
    expect(paramOf(url, 'X-Amz-Credential')).toContain('/auto/');
  });

  it("defaults to 'auto' when region is empty string", async () => {
    const p = new Presigner({ ...CFG, region: '' });
    const url = await p.get({ key: 'k', expiresIn: 60 });
    expect(paramOf(url, 'X-Amz-Credential')).toContain('/auto/');
  });

  it('respects explicit region', async () => {
    const p = new Presigner({ ...CFG, region: 'us-east-1' });
    const url = await p.get({ key: 'k', expiresIn: 60 });
    expect(paramOf(url, 'X-Amz-Credential')).toContain('/us-east-1/');
  });

  it('different regions → different signatures', async () => {
    const a = new Presigner({ ...CFG, region: 'us-east-1' });
    const b = new Presigner({ ...CFG, region: 'eu-west-1' });
    const ua = await a.get({ key: 'x', expiresIn: 60 });
    const ub = await b.get({ key: 'x', expiresIn: 60 });
    expect(sigOf(ua)).not.toBe(sigOf(ub));
  });
});

describe('Header normalization', () => {
  const p = new Presigner(CFG);

  it('signed header names are lowercased and sorted', async () => {
    const r = await p.debugSign({
      method: 'PUT',
      key: 'k',
      expiresIn: 60,
      headers: { 'Content-Type': 'text/plain', 'IF-None-Match': '*', 'X-Amz-Custom': 'v' },
    });
    const sh = r.signedHeaders.split(';');
    expect(sh).toEqual([...sh].toSorted());
    for (const name of sh) {
      expect(name).toBe(name.toLowerCase());
    }
  });

  it('header values are trimmed and inner whitespace collapsed', async () => {
    const r = await p.debugSign({
      method: 'PUT',
      key: 'k',
      expiresIn: 60,
      headers: { 'x-amz-meta-foo': '  hello   world  ' },
    });
    expect(r.canonicalRequest).toContain('x-amz-meta-foo:hello world\n');
  });
});

describe('GET vs PUT differ', () => {
  const p = new Presigner(CFG);

  it('GET and PUT produce different signatures for the same key', async () => {
    const get = await p.get({ key: 'x', expiresIn: 60 });
    const put = await p.put({ key: 'x', expiresIn: 60 });
    expect(sigOf(get)).not.toBe(sigOf(put.url));
  });
});

describe('Cache: derivation cost is constant after warmup', () => {
  it('1 cold call + N warm calls = exactly 1 derivation (4 HMACs + 1 importKey)', async () => {
    const p = new Presigner(CFG);
    const importSpy = vi.spyOn(crypto.subtle, 'importKey');

    await p.get({ key: 'a', expiresIn: 60 });
    const importsAfterCold = importSpy.mock.calls.length;

    for (let i = 0; i < 200; i++) {
      await p.get({ key: `k${i}`, expiresIn: 60 });
    }
    expect(importSpy.mock.calls.length).toBe(importsAfterCold);
  });
});

// ====== FUZZ TESTS ======

const keyArb = fc
  .array(
    fc.oneof(
      { weight: 50, arbitrary: fc.integer({ min: 33, max: 126 }) },
      { weight: 20, arbitrary: fc.constant('/'.charCodeAt(0)) },
      { weight: 15, arbitrary: fc.integer({ min: 0xa0, max: 0xa0 + 0x300 - 1 }) },
      { weight: 15, arbitrary: fc.integer({ min: 0x1f300, max: 0x1f300 + 0x300 - 1 }) },
    ),
    { minLength: 1, maxLength: 80 },
  )
  .map((codes) => {
    const s = codes
      .map((c) => String.fromCodePoint(c))
      .join('')
      .replace(/^\/+/, '')
      .replaceAll(/\/{2,}/g, '/');
    return s.length > 0 ? s : 'x';
  });

// Only `key` and `expiresIn` are required; fc.record randomly includes or
// omits the others (≈50/50), matching the original coin-flip-per-field shape.
const putArgsArb: fc.Arbitrary<PutArgs> = fc.record(
  {
    key: keyArb,
    expiresIn: fc.integer({ min: 60, max: 60 + 3599 }),
    contentType: fc.constant('application/octet-stream'),
    contentLength: fc.integer({ min: 0, max: 999_999_999 }),
    sha256: fc
      .uint8Array({ minLength: 32, maxLength: 32 })
      .map((b) => Buffer.from(b).toString('base64')),
    ifNoneMatch: fc.constant(true),
  },
  { requiredKeys: ['key', 'expiresIn'] },
);

describe('Property: random GET keys produce valid URLs', () => {
  const p = new Presigner(CFG);

  it.prop([keyArb], { numRuns: 300 })(
    'any randomly generated key yields a valid presigned GET URL',
    async (key) => {
      const url = await p.get({ key, expiresIn: 3600 });
      const u = new URL(url);
      expect(u.protocol).toBe('http:');
      for (const name of REQUIRED_PARAMS) {
        expect(u.searchParams.has(name)).toBe(true);
      }
      expect(sigOf(url)).toMatch(HEX64);
    },
  );
});

describe('Property: random PUT scenarios produce valid url+headers', () => {
  const p = new Presigner(CFG);

  it.prop([putArgsArb], { numRuns: 300 })(
    'any randomly generated PUT args yields a valid presigned URL and headers',
    async (args) => {
      const out = await p.put(args);
      const u = new URL(out.url);

      for (const name of REQUIRED_PARAMS) {
        expect(u.searchParams.has(name)).toBe(true);
      }
      expect(sigOf(out.url)).toMatch(HEX64);

      const sh = paramOf(out.url, 'X-Amz-SignedHeaders').split(';');
      expect(sh).toEqual([...sh].toSorted());
      expect(sh).toContain('host');

      for (const h of sh) {
        if (h !== 'host') {
          expect(out.headers[h]).toBeDefined();
        }
      }
    },
  );
});

describe('CopyObject and Tigris rename', () => {
  const p = new Presigner(CFG);

  it('PUTs to the destination key and signs x-amz-copy-source', async () => {
    let url = '';
    let method: string | undefined;
    let headers = new Headers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (typeof input === 'string') {
        url = input;
      }
      method = init?.method;
      headers = new Headers(init?.headers);
      return new Response('<CopyObjectResult></CopyObjectResult>', { status: 200 });
    });

    const res = await p.copy({
      from: 'staging/abc.tar.zst',
      to: 'public/pkg/1.0.0.tar.zst',
      expiresIn: 60,
    });

    expect(res.ok).toBe(true);
    expect(method).toBe('PUT');
    expect(headers.get('x-amz-copy-source')).toBe(`${BUCKET}/staging/abc.tar.zst`);
    expect(headers.get('x-tigris-rename')).toBeNull();
    expect(new URL(url).pathname).toBe(`/${BUCKET}/public/pkg/1.0.0.tar.zst`);
    expect(paramOf(url, 'X-Amz-SignedHeaders').split(';')).toContain('x-amz-copy-source');
  });

  it('rename:true sends and signs x-tigris-rename', async () => {
    let url = '';
    let headers = new Headers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (typeof input === 'string') {
        url = input;
      }
      headers = new Headers(init?.headers);
      return new Response('', { status: 200 });
    });

    await p.copy({ from: 'staging/x', to: 'final/x', rename: true, expiresIn: 60 });

    expect(headers.get('x-tigris-rename')).toBe('true');
    const signed = paramOf(url, 'X-Amz-SignedHeaders').split(';');
    expect(signed).toContain('x-tigris-rename');
    expect(signed).toContain('x-amz-copy-source');
  });

  it('retries on 5xx then succeeds', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      return new Response('', { status: calls === 1 ? 503 : 200 });
    });

    const res = await p.copy({ from: 'a', to: 'b', expiresIn: 60, retries: 1 });

    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
  });

  it('surfaces a 200-with-<Error> body as 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<Error><Code>SlowDown</Code></Error>', { status: 200 }),
    );

    const res = await p.copy({ from: 'a', to: 'b', expiresIn: 60, retries: 0 });

    expect(res.status).toBe(502);
  });
});

describe('DeleteObject', () => {
  const p = new Presigner(CFG);

  it('sends a DELETE to the key', async () => {
    let url = '';
    let method: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (typeof input === 'string') {
        url = input;
      }
      method = init?.method;
      return new Response(null, { status: 204 });
    });

    const res = await p.del('public/pkg/1.0.0.tar.zst', 60);

    expect(res.ok).toBe(true);
    expect(method).toBe('DELETE');
    expect(new URL(url).pathname).toBe(`/${BUCKET}/public/pkg/1.0.0.tar.zst`);
  });
});

describe('upload with in-process checksum verification', () => {
  const p = new Presigner(CFG);
  const data = new TextEncoder().encode('the quick brown fox');
  const digest = createHash('sha256').update(data).digest('base64');
  const makeBody = (): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(c) {
        c.enqueue(data);
        c.close();
      },
    });

  it('passes when the streamed bytes match verifySha256', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(drainingFetch);

    const res = await p.upload({
      key: 'staging/x',
      verifySha256: digest,
      expiresIn: 60,
      retries: 0,
      body: makeBody,
    });
    expect(res.ok).toBe(true);
  });

  it('throws ChecksumMismatchError on a mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(drainingFetch);

    await expect(
      p.upload({
        key: 'staging/x',
        verifySha256: `${'A'.repeat(43)}=`,
        expiresIn: 60,
        retries: 0,
        body: makeBody,
      }),
    ).rejects.toThrow(ChecksumMismatchError);
  });
});
