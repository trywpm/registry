import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { fc, it } from '@fast-check/vitest';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { describe, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vite-plus/test';

import { KmsClient, KmsError } from './kms';

import type { KmsConfig, SignInput, SigningAlgorithm, MessageType } from './kms.ts';

const FIXED_YMD = '20260510';
const FIXED_AMZ = '20260510T123456Z';
const FIXED_DATE = new Date('2026-05-10T12:34:56.000Z');
const fixedClock = (): number => FIXED_DATE.getTime();

const REGION = 'us-east-1';
const KEY_ID = '1234abcd-12ab-34cd-56ef-1234567890ab';
const ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

// Default test config: no retries, fixed clock, zero delays.
const CFG: KmsConfig = {
  region: REGION,
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  clock: fixedClock,
  maxRetries: 0,
  retryBaseDelayMs: 0,
};

const DEFAULT_RESPONSE = {
  KeyId: KEY_ID,
  Signature: Buffer.from('fake-signature-bytes').toString('base64'),
  SigningAlgorithm: 'ECDSA_SHA_256' as const,
};

const MIN_INPUT: SignInput = {
  KeyId: KEY_ID,
  Message: new TextEncoder().encode('hello'),
  SigningAlgorithm: 'ECDSA_SHA_256',
};

const HEX64 = /^[0-9a-f]{64}$/;
const AUTH_RE =
  /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/;

const ALL_ALGORITHMS = [
  'RSASSA_PSS_SHA_256',
  'RSASSA_PSS_SHA_384',
  'RSASSA_PSS_SHA_512',
  'RSASSA_PKCS1_V1_5_SHA_256',
  'RSASSA_PKCS1_V1_5_SHA_384',
  'RSASSA_PKCS1_V1_5_SHA_512',
  'ECDSA_SHA_256',
  'ECDSA_SHA_384',
  'ECDSA_SHA_512',
  'SM2DSA',
  'ML_DSA_SHAKE_256',
  'ED25519_SHA_512',
  'ED25519_PH_SHA_512',
] as const satisfies readonly SigningAlgorithm[];

const ALL_MESSAGE_TYPES = [
  'RAW',
  'DIGEST',
  'EXTERNAL_MU',
] as const satisfies readonly MessageType[];

function toRecord(h: HeadersInit | undefined): Record<string, string> {
  if (h == null) {
    return {};
  }
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h);
  }
  return { ...h };
}

function toBodyString(b: BodyInit | null | undefined): string {
  if (b == null) {
    return '';
  }
  if (typeof b === 'string') {
    return b;
  }
  if (b instanceof Uint8Array) {
    return Buffer.from(b).toString('utf8');
  }
  return '';
}

function mockOk(response: object = DEFAULT_RESPONSE): Response {
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'content-type': 'application/x-amz-json-1.1' },
  });
}

function mockErr(status: number, body: object | string): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/x-amz-json-1.1' },
  });
}

type Captured = {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
};

function parseAuth(authHeader: string): {
  credential: string;
  signedHeaders: string;
  signature: string;
} {
  const m = AUTH_RE.exec(authHeader);
  if (m == null) {
    throw new Error(`Authorization didn't match: ${authHeader}`);
  }
  return { credential: m[1], signedHeaders: m[2], signature: m[3] };
}

function authOf(call: Captured): {
  credential: string;
  signedHeaders: string;
  signature: string;
} {
  return parseAuth(call.headers['authorization']);
}

const captured: Captured[] = [];
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  captured.length = 0;
  fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: input instanceof Request ? input.url : String(input),
      method: init?.method ?? 'GET',
      headers: toRecord(init?.headers),
      body: toBodyString(init?.body),
    });
    return mockOk();
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KmsClient — config validation', () => {
  const badCfgs: ReadonlyArray<{ case: string; cfg: KmsConfig }> = [
    {
      case: 'missing region',
      cfg: { region: '', accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    },
    {
      case: 'missing accessKeyId',
      cfg: { region: REGION, accessKeyId: '', secretAccessKey: SECRET_KEY },
    },
    {
      case: 'missing secretAccessKey',
      cfg: { region: REGION, accessKeyId: ACCESS_KEY, secretAccessKey: '' },
    },
    {
      case: 'endpoint with trailing slash',
      cfg: {
        region: REGION,
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        endpoint: 'https://kms.example.com/',
      },
    },
    {
      case: 'endpoint with unsupported scheme',
      cfg: {
        region: REGION,
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        endpoint: 'ftp://kms.example.com',
      },
    },
    {
      case: 'endpoint that is garbage',
      cfg: {
        region: REGION,
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        endpoint: 'not a url',
      },
    },
  ];

  it.each(badCfgs)('throws when $case', ({ cfg }) => {
    expect(() => new KmsClient(cfg)).toThrow();
  });

  it('defaults host to kms.{region}.amazonaws.com when no endpoint provided', () => {
    const c = new KmsClient({ region: 'eu-west-1', accessKeyId: 'x', secretAccessKey: 'y' });
    expect(c.host).toBe('kms.eu-west-1.amazonaws.com');
  });

  it.each([
    {
      name: 'https no port',
      endpoint: 'https://kms.us-east-1.amazonaws.com',
      host: 'kms.us-east-1.amazonaws.com',
    },
    { name: 'https + port', endpoint: 'https://kms.local:8443', host: 'kms.local:8443' },
    { name: 'http + port', endpoint: 'http://localhost:8080', host: 'localhost:8080' },
    { name: 'http IPv4 + port', endpoint: 'http://127.0.0.1:9000', host: '127.0.0.1:9000' },
    { name: 'http IPv6 + port', endpoint: 'http://[::1]:9000', host: '[::1]:9000' },
  ])('accepts endpoint: $name', ({ endpoint, host }) => {
    const c = new KmsClient({ ...CFG, endpoint });
    expect(c.host).toBe(host);
  });
});

describe('KmsClient — input validation', () => {
  it('rejects empty KeyId', async () => {
    const c = new KmsClient(CFG);
    await expect(c.sign({ ...MIN_INPUT, KeyId: '' })).rejects.toThrow();
  });

  it('accepts empty Message (KMS rejects server-side, not client)', async () => {
    const c = new KmsClient(CFG);
    await expect(c.sign({ ...MIN_INPUT, Message: new Uint8Array(0) })).resolves.toBeDefined();
  });
});

describe('sign — request shape', () => {
  it('POSTs to https://{host}/', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].url).toBe(`https://kms.${REGION}.amazonaws.com/`);
  });

  it('uses custom endpoint for URL when provided', async () => {
    await new KmsClient({ ...CFG, endpoint: 'https://kms.local:8443' }).sign(MIN_INPUT);
    expect(captured[0].url).toBe('https://kms.local:8443/');
  });

  it('sends content-type, x-amz-date, x-amz-target, authorization', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const h = captured[0].headers;
    expect(h['content-type']).toBe('application/x-amz-json-1.1');
    expect(h['x-amz-date']).toBe(FIXED_AMZ);
    expect(h['x-amz-target']).toBe('TrentService.Sign');
    expect(h['authorization']).toMatch(AUTH_RE);
  });

  it.each(['host', 'x-amz-content-sha256', 'content-length'])(
    'does NOT send the forbidden/unneeded header %s',
    async (name) => {
      await new KmsClient(CFG).sign(MIN_INPUT);
      const names = Object.keys(captured[0].headers).map((k) => k.toLowerCase());
      expect(names).not.toContain(name);
    },
  );
});

describe('sign — Authorization header structure', () => {
  it('has algorithm, credential, signed headers, signature — all in spec format', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const { credential, signedHeaders, signature } = authOf(captured[0]);
    expect(credential).toBe(`${ACCESS_KEY}/${FIXED_YMD}/${REGION}/kms/aws4_request`);
    expect(signedHeaders).toBe('content-type;host;x-amz-date;x-amz-target');
    expect(signature).toMatch(HEX64);
  });

  it('SignedHeaders list is alphabetically sorted', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const sh = authOf(captured[0]).signedHeaders.split(';');
    expect(sh).toEqual([...sh].toSorted());
  });

  it('SignedHeaders is all-lowercase', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const sh = authOf(captured[0]).signedHeaders;
    expect(sh).toBe(sh.toLowerCase());
  });

  it('uses single-space comma separators between parts (spec format)', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const auth = captured[0].headers['authorization'];
    expect(auth).toMatch(/, SignedHeaders=/);
    expect(auth).toMatch(/, Signature=/);
  });
});

describe('sign — request body', () => {
  it('body is JSON with PascalCase KeyId/Message/SigningAlgorithm', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    const body = JSON.parse(captured[0].body);
    expect(body.KeyId).toBe(KEY_ID);
    expect(body.Message).toBe(Buffer.from('hello', 'utf8').toString('base64'));
    expect(body.SigningAlgorithm).toBe('ECDSA_SHA_256');
  });

  it('Message round-trips through base64 for arbitrary bytes', async () => {
    const payload = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      payload[i] = i;
    }
    await new KmsClient(CFG).sign({ ...MIN_INPUT, Message: payload });
    const body = JSON.parse(captured[0].body);
    expect([...Buffer.from(body.Message, 'base64')]).toEqual([...payload]);
  });

  it.each(ALL_MESSAGE_TYPES)('MessageType=%s included in body', async (mt) => {
    await new KmsClient(CFG).sign({ ...MIN_INPUT, MessageType: mt });
    expect(JSON.parse(captured[0].body).MessageType).toBe(mt);
  });

  it('MessageType omitted when undefined', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    expect('MessageType' in JSON.parse(captured[0].body)).toBe(false);
  });

  it.each([
    { name: 'DryRun=true → present', input: { DryRun: true }, present: true },
    { name: 'DryRun=false → omitted', input: { DryRun: false }, present: false },
  ])('$name', async ({ input, present }) => {
    await new KmsClient(CFG).sign({ ...MIN_INPUT, ...input });
    const body = JSON.parse(captured[0].body);
    if (present) {
      expect(body.DryRun).toBe(true);
    } else {
      expect('DryRun' in body).toBe(false);
    }
  });

  it('DryRun=undefined → omitted', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    expect('DryRun' in JSON.parse(captured[0].body)).toBe(false);
  });

  it('GrantTokens non-empty → present', async () => {
    await new KmsClient(CFG).sign({ ...MIN_INPUT, GrantTokens: ['t1', 't2'] });
    expect(JSON.parse(captured[0].body).GrantTokens).toEqual(['t1', 't2']);
  });

  it('GrantTokens empty array → omitted', async () => {
    await new KmsClient(CFG).sign({ ...MIN_INPUT, GrantTokens: [] });
    expect('GrantTokens' in JSON.parse(captured[0].body)).toBe(false);
  });

  it.each(ALL_ALGORITHMS)('SigningAlgorithm=%s round-trips', async (algo) => {
    await new KmsClient(CFG).sign({ ...MIN_INPUT, SigningAlgorithm: algo });
    expect(JSON.parse(captured[0].body).SigningAlgorithm).toBe(algo);
  });

  it('payload hash in canonical request matches sha256 of actual body', async () => {
    const c = new KmsClient(CFG);
    await c.sign(MIN_INPUT);

    const body = new Uint8Array(Buffer.from(captured[0].body, 'utf8'));
    const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', body)).toString('hex');

    const r = await c.debugSign(MIN_INPUT);
    expect(r.canonicalRequest.split('\n').at(-1)).toBe(expectedHash);
  });
});

describe('sign — response parsing', () => {
  it('returns { KeyId, Signature (Uint8Array), SigningAlgorithm }', async () => {
    const sigBytes = new Uint8Array([0x30, 0x44, 0x02, 0x20, 0xab, 0xcd]);
    fetchSpy.mockResolvedValueOnce(
      mockOk({
        KeyId: KEY_ID,
        Signature: Buffer.from(sigBytes).toString('base64'),
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    );
    const out = await new KmsClient(CFG).sign(MIN_INPUT);
    expect(out.KeyId).toBe(KEY_ID);
    expect(out.Signature).toBeInstanceOf(Uint8Array);
    expect([...out.Signature]).toEqual([...sigBytes]);
    expect(out.SigningAlgorithm).toBe('ECDSA_SHA_256');
  });

  it('Signature round-trips for all 256 byte values', async () => {
    const sigBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      sigBytes[i] = i;
    }
    fetchSpy.mockResolvedValueOnce(
      mockOk({
        KeyId: KEY_ID,
        Signature: Buffer.from(sigBytes).toString('base64'),
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    );
    const out = await new KmsClient(CFG).sign(MIN_INPUT);
    expect([...out.Signature]).toEqual([...sigBytes]);
  });
});

describe('sign — determinism and sensitivity', () => {
  it('same inputs → same signature', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    await new KmsClient(CFG).sign(MIN_INPUT);
    expect(authOf(captured[0]).signature).toBe(authOf(captured[1]).signature);
  });

  const sensitivityCases: ReadonlyArray<{ mutate: string; b: SignInput }> = [
    { mutate: 'KeyId', b: { ...MIN_INPUT, KeyId: 'alias/other' } },
    { mutate: 'Message', b: { ...MIN_INPUT, Message: new TextEncoder().encode('different') } },
    { mutate: 'SigningAlgorithm', b: { ...MIN_INPUT, SigningAlgorithm: 'ECDSA_SHA_512' } },
    { mutate: 'MessageType', b: { ...MIN_INPUT, MessageType: 'DIGEST' } },
    { mutate: 'DryRun', b: { ...MIN_INPUT, DryRun: true } },
    { mutate: 'GrantTokens', b: { ...MIN_INPUT, GrantTokens: ['t'] } },
  ];

  it.each(sensitivityCases)('different $mutate → different signatures', async ({ b }) => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    await new KmsClient(CFG).sign(b);
    expect(authOf(captured[0]).signature).not.toBe(authOf(captured[1]).signature);
  });

  it('different region → different signatures', async () => {
    await new KmsClient({ ...CFG, region: 'us-east-1' }).sign(MIN_INPUT);
    await new KmsClient({ ...CFG, region: 'eu-west-1' }).sign(MIN_INPUT);
    expect(authOf(captured[0]).signature).not.toBe(authOf(captured[1]).signature);
  });

  it('different secret → different signatures', async () => {
    await new KmsClient({ ...CFG, secretAccessKey: 'a'.repeat(40) }).sign(MIN_INPUT);
    await new KmsClient({ ...CFG, secretAccessKey: 'b'.repeat(40) }).sign(MIN_INPUT);
    expect(authOf(captured[0]).signature).not.toBe(authOf(captured[1]).signature);
  });
});

describe('sign — session token', () => {
  it('omitted from headers when not configured', async () => {
    await new KmsClient(CFG).sign(MIN_INPUT);
    expect('x-amz-security-token' in captured[0].headers).toBe(false);
  });

  it('sent as header when configured', async () => {
    await new KmsClient({ ...CFG, sessionToken: 'IQoJb3JpZ2luX2VjE...' }).sign(MIN_INPUT);
    expect(captured[0].headers['x-amz-security-token']).toBe('IQoJb3JpZ2luX2VjE...');
  });

  it('inserted in SignedHeaders at correct alphabetical position', async () => {
    await new KmsClient({ ...CFG, sessionToken: 'tkn' }).sign(MIN_INPUT);
    expect(authOf(captured[0]).signedHeaders.split(';')).toEqual([
      'content-type',
      'host',
      'x-amz-date',
      'x-amz-security-token',
      'x-amz-target',
    ]);
  });

  it('different session tokens → different signatures', async () => {
    await new KmsClient({ ...CFG, sessionToken: 'a' }).sign(MIN_INPUT);
    await new KmsClient({ ...CFG, sessionToken: 'b' }).sign(MIN_INPUT);
    expect(authOf(captured[0]).signature).not.toBe(authOf(captured[1]).signature);
  });
});

describe('sign — error handling', () => {
  it('throws KmsError with name=errorType, errorType, httpStatus, message', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockErr(400, { __type: 'com.amazonaws.kms#NotFoundException', message: 'Key not found' }),
    );
    const err = await new KmsClient(CFG).sign(MIN_INPUT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KmsError);
    expect(err).toMatchObject({
      name: 'NotFoundException',
      errorType: 'NotFoundException',
      httpStatus: 400,
      message: 'Key not found',
    });
  });

  it.each([
    {
      name: 'strips namespace prefix from __type',
      body: { __type: 'com.amazon.coral.service#DisabledException' },
      errorType: 'DisabledException',
    },
    {
      name: '__type without # is preserved as-is',
      body: { __type: 'DisabledException' },
      errorType: 'DisabledException',
    },
  ])('$name', async ({ body, errorType }) => {
    fetchSpy.mockResolvedValueOnce(mockErr(400, body));
    await expect(new KmsClient(CFG).sign(MIN_INPUT)).rejects.toMatchObject({ errorType });
  });

  it('handles error body without __type', async () => {
    fetchSpy.mockResolvedValueOnce(mockErr(400, { message: 'no type' }));
    await expect(new KmsClient(CFG).sign(MIN_INPUT)).rejects.toMatchObject({
      message: 'no type',
      httpStatus: 400,
    });
  });

  it('handles non-JSON error body', async () => {
    fetchSpy.mockResolvedValueOnce(mockErr(503, '<html>service down</html>'));
    await expect(new KmsClient(CFG).sign(MIN_INPUT)).rejects.toMatchObject({
      message: '<html>service down</html>',
      httpStatus: 503,
    });
  });

  it('accepts capital-M Message field as fallback', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockErr(400, { __type: 'NotFoundException', Message: 'caps message' }),
    );
    await expect(new KmsClient(CFG).sign(MIN_INPUT)).rejects.toMatchObject({
      message: 'caps message',
    });
  });

  it.each([
    'DisabledException',
    'InvalidKeyUsageException',
    'NotFoundException',
    'KMSInvalidStateException',
    'InvalidGrantTokenException',
    'DryRunOperationException',
  ])('does NOT retry %s (400)', async (errType) => {
    fetchSpy.mockImplementation(async () => mockErr(400, { __type: errType }));
    await expect(new KmsClient({ ...CFG, maxRetries: 3 }).sign(MIN_INPUT)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry AccessDeniedException (403)', async () => {
    fetchSpy.mockImplementation(async () => mockErr(403, { __type: 'AccessDeniedException' }));
    await expect(new KmsClient({ ...CFG, maxRetries: 3 }).sign(MIN_INPUT)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('sign — retry behavior', () => {
  it.each([
    'DependencyTimeoutException',
    'KeyUnavailableException',
    'KMSInternalException',
    'ThrottlingException',
  ])('retries on %s and eventually succeeds', async (errType) => {
    fetchSpy
      .mockResolvedValueOnce(mockErr(500, { __type: errType }))
      .mockResolvedValueOnce(mockErr(500, { __type: errType }))
      .mockResolvedValueOnce(mockOk());

    const c = new KmsClient({ ...CFG, maxRetries: 3 });
    await expect(c.sign(MIN_INPUT)).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('retries on HTTP 429', async () => {
    fetchSpy.mockResolvedValueOnce(mockErr(429, '')).mockResolvedValueOnce(mockOk());
    const c = new KmsClient({ ...CFG, maxRetries: 2 });
    await expect(c.sign(MIN_INPUT)).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx with unknown error type', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockErr(502, { __type: 'BadGateway' }))
      .mockResolvedValueOnce(mockOk());
    const c = new KmsClient({ ...CFG, maxRetries: 2 });
    await expect(c.sign(MIN_INPUT)).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (fetch throws)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(mockOk());
    const c = new KmsClient({ ...CFG, maxRetries: 2 });
    await expect(c.sign(MIN_INPUT)).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops after maxRetries (3 retries = 4 total attempts)', async () => {
    fetchSpy.mockImplementation(async () => mockErr(500, { __type: 'KMSInternalException' }));
    const c = new KmsClient({ ...CFG, maxRetries: 3 });
    await expect(c.sign(MIN_INPUT)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('maxRetries=0 → exactly 1 attempt', async () => {
    fetchSpy.mockImplementation(async () => mockErr(500, { __type: 'KMSInternalException' }));
    const c = new KmsClient({ ...CFG, maxRetries: 0 });
    await expect(c.sign(MIN_INPUT)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves final error after retry exhaustion', async () => {
    fetchSpy.mockImplementation(async () =>
      mockErr(500, { __type: 'KMSInternalException', message: 'kaboom' }),
    );
    const c = new KmsClient({ ...CFG, maxRetries: 2 });
    await expect(c.sign(MIN_INPUT)).rejects.toMatchObject({
      errorType: 'KMSInternalException',
      httpStatus: 500,
      message: 'kaboom',
    });
  });
});

describe('Caching behavior', () => {
  it('daily signing key derived only once across many sequential calls', async () => {
    const c = new KmsClient(CFG);
    const spy = vi.spyOn(crypto.subtle, 'importKey');

    await c.sign(MIN_INPUT);
    const importsAfterCold = spy.mock.calls.length;

    for (let i = 0; i < 50; i++) {
      await c.sign({ ...MIN_INPUT, KeyId: `${KEY_ID}-${i}` });
    }

    expect(spy.mock.calls.length).toBe(importsAfterCold);
  });

  it('cache invalidates on UTC day rollover', async () => {
    let nowMs = new Date('2026-05-10T23:59:00.000Z').getTime();
    const c = new KmsClient({ ...CFG, clock: (): number => nowMs });
    await c.sign(MIN_INPUT);
    nowMs = new Date('2026-05-11T00:00:30.000Z').getTime();
    await c.sign(MIN_INPUT);

    expect(authOf(captured[0]).credential).toContain('/20260510/');
    expect(authOf(captured[1]).credential).toContain('/20260511/');
    expect(authOf(captured[0]).signature).not.toBe(authOf(captured[1]).signature);
  });

  it('concurrent first calls share derivation (inflight dedupe)', async () => {
    const c = new KmsClient(CFG);
    const signSpy = vi.spyOn(crypto.subtle, 'sign');

    await Promise.all(
      Array.from({ length: 32 }, (_, i) => c.sign({ ...MIN_INPUT, KeyId: `${KEY_ID}-${i}` })),
    );
    // 4 HMACs for derivation (shared) + 32 signing HMACs = 36
    expect(signSpy.mock.calls.length).toBe(36);
  });
});

describe('debugSign — canonical request structure (AWS spec)', () => {
  const c = new KmsClient(CFG);

  it('first 3 sections: POST, /, empty query string', async () => {
    const r = await c.debugSign(MIN_INPUT);
    const lines = r.canonicalRequest.split('\n');
    expect(lines[0]).toBe('POST');
    expect(lines[1]).toBe('/');
    expect(lines[2]).toBe('');
  });

  it('canonical headers section is alphabetically sorted by name', async () => {
    const r = await c.debugSign(MIN_INPUT);
    const all = r.canonicalRequest.split('\n');
    const blankIdx = all.indexOf('', 3);
    const headerLines = all.slice(3, blankIdx);
    const names = headerLines.map((l) => l.split(':')[0]);
    expect(names).toEqual([...names].toSorted());
  });

  it('last line is the real payload hash, NOT UNSIGNED-PAYLOAD', async () => {
    const r = await c.debugSign(MIN_INPUT);
    const last = r.canonicalRequest.split('\n').at(-1);
    expect(last).not.toBe('UNSIGNED-PAYLOAD');
    expect(last).toMatch(HEX64);
  });

  it('payload hash equals sha256(bodyText)', async () => {
    const r = await c.debugSign(MIN_INPUT);
    const bytes = new Uint8Array(Buffer.from(r.bodyText, 'utf8'));
    const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    expect(r.canonicalRequest.split('\n').at(-1)).toBe(expectedHash);
  });

  it('string-to-sign has exactly 4 lines per AWS spec', async () => {
    const r = await c.debugSign(MIN_INPUT);
    const lines = r.stringToSign.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('AWS4-HMAC-SHA256');
    expect(lines[1]).toBe(FIXED_AMZ);
    expect(lines[2]).toBe(`${FIXED_YMD}/${REGION}/kms/aws4_request`);
    expect(lines[3]).toMatch(HEX64);
  });

  it('signedHeaders is the canonical 4 with no session token', async () => {
    const r = await c.debugSign(MIN_INPUT);
    expect(r.signedHeaders).toBe('content-type;host;x-amz-date;x-amz-target');
  });

  it('signedHeaders inserts x-amz-security-token alphabetically with session token', async () => {
    const r = await new KmsClient({ ...CFG, sessionToken: 't' }).debugSign(MIN_INPUT);
    expect(r.signedHeaders).toBe('content-type;host;x-amz-date;x-amz-security-token;x-amz-target');
  });

  it('signature is 64 hex chars', async () => {
    const r = await c.debugSign(MIN_INPUT);
    expect(r.signature).toMatch(HEX64);
  });

  it('amzDate and ymd match the configured clock', async () => {
    const r = await c.debugSign(MIN_INPUT);
    expect(r.amzDate).toBe(FIXED_AMZ);
    expect(r.ymd).toBe(FIXED_YMD);
  });
});

describe('Signature regression baseline', () => {
  it('produces a stable signature for a fixed input', async () => {
    const c = new KmsClient({
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      clock: () => new Date('2026-05-10T12:34:56.000Z').getTime(),
    });
    const r = await c.debugSign({
      KeyId: 'test-key-id',
      Message: new TextEncoder().encode('hello'),
      SigningAlgorithm: 'ECDSA_SHA_256',
      MessageType: 'RAW',
    });
    expect(r.signature).toMatchSnapshot();
    expect(r.canonicalRequest).toMatchSnapshot();
    expect(r.stringToSign).toMatchSnapshot();
  });
});

type SdkRequest = {
  method: string;
  protocol: string;
  hostname: string;
  port?: number;
  path: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
};

type SdkCapture = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

describe('AWS SDK v3 oracle: structural equivalence', () => {
  async function captureSdkRequest(input: SignInput): Promise<SdkCapture> {
    let capture: SdkCapture | undefined;

    const client = new KMSClient({
      region: REGION,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      requestHandler: {
        handle: async (req: SdkRequest) => {
          const rawBody = req.body;
          const bodyStr =
            typeof rawBody === 'string'
              ? rawBody
              : rawBody instanceof Uint8Array
                ? Buffer.from(rawBody).toString('utf8')
                : '';
          capture = {
            method: req.method,
            url: `${req.protocol}//${req.hostname}${req.port != null ? `:${req.port}` : ''}${req.path}`,
            headers: req.headers,
            body: bodyStr,
          };
          return {
            response: {
              statusCode: 200,
              headers: { 'content-type': 'application/x-amz-json-1.1' },
              body: Readable.from(
                Buffer.from(
                  JSON.stringify({
                    KeyId: input.KeyId,
                    Signature: 'ZmFrZQ==',
                    SigningAlgorithm: input.SigningAlgorithm,
                  }),
                ),
              ),
            },
          };
        },
      },
    });

    await client.send(
      new SignCommand({
        KeyId: input.KeyId,
        Message: input.Message,
        MessageType: input.MessageType,
        SigningAlgorithm: input.SigningAlgorithm,
      }),
    );

    if (capture === undefined) {
      throw new Error('SDK did not capture a request');
    }

    return capture;
  }

  const cfgNoClock: KmsConfig = {
    region: REGION,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    maxRetries: 0,
    retryBaseDelayMs: 0,
  };

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_DATE);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('URL host matches SDK', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    expect(new URL(captured[0].url).host).toBe(new URL(sdk.url).host);
  });

  it('URL path is / for both', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    expect(new URL(captured[0].url).pathname).toBe('/');
    expect(new URL(sdk.url).pathname).toBe('/');
  });

  it('method is POST for both', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    expect(captured[0].method).toBe('POST');
    expect(sdk.method).toBe('POST');
  });

  it.each(['x-amz-target', 'content-type', 'x-amz-date'])(
    'header %s matches SDK byte-for-byte',
    async (header) => {
      const sdk = await captureSdkRequest(MIN_INPUT);
      await new KmsClient(cfgNoClock).sign(MIN_INPUT);
      expect(captured[0].headers[header]).toBe(sdk.headers[header]);
    },
  );

  it('body JSON has identical shape and values', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    expect(JSON.parse(captured[0].body)).toEqual(JSON.parse(sdk.body));
  });

  it('Authorization credential scope matches SDK byte-for-byte', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    const ours = parseAuth(captured[0].headers['authorization']);
    const theirs = parseAuth(sdk.headers['authorization']);
    expect(ours.credential).toBe(theirs.credential);
  });

  it('REGRESSION: SDK signs x-amz-content-sha256, we intentionally do NOT', async () => {
    const sdk = await captureSdkRequest(MIN_INPUT);
    await new KmsClient(cfgNoClock).sign(MIN_INPUT);
    expect(parseAuth(sdk.headers['authorization']).signedHeaders.split(';')).toContain(
      'x-amz-content-sha256',
    );
    expect(parseAuth(captured[0].headers['authorization']).signedHeaders.split(';')).not.toContain(
      'x-amz-content-sha256',
    );
  });
});

// ===== FUZZ TESTS =====

const messageArb = fc.uint8Array({ minLength: 1, maxLength: 256 });
const keyIdArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes('\u0000'));
const algoArb = fc.constantFrom(...ALL_ALGORITHMS);
const msgTypeArb = fc.option(fc.constantFrom(...ALL_MESSAGE_TYPES), { nil: undefined });

const signInputArb: fc.Arbitrary<SignInput> = fc.record(
  {
    KeyId: keyIdArb,
    Message: messageArb,
    SigningAlgorithm: algoArb,
    MessageType: msgTypeArb,
    DryRun: fc.boolean(),
    GrantTokens: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
      minLength: 0,
      maxLength: 3,
    }),
  },
  { requiredKeys: ['KeyId', 'Message', 'SigningAlgorithm'] },
);

describe('Property: random valid inputs always produce a valid signed request', () => {
  const c = new KmsClient(CFG);

  it.prop([signInputArb], { numRuns: 200 })(
    'any well-formed input yields a valid SigV4 request',
    async (input) => {
      const r = await c.debugSign(input);

      expect(r.signature).toMatch(HEX64);

      const lines = r.canonicalRequest.split('\n');
      expect(lines[0]).toBe('POST');
      expect(lines[1]).toBe('/');
      expect(lines[2]).toBe('');
      expect(lines.at(-1)).toMatch(HEX64);

      const body = JSON.parse(r.bodyText);
      expect(body.KeyId).toBe(input.KeyId);
      expect(body.SigningAlgorithm).toBe(input.SigningAlgorithm);
      expect(Buffer.from(body.Message, 'base64').equals(Buffer.from(input.Message))).toBe(true);

      if (input.MessageType !== undefined) {
        expect(body.MessageType).toBe(input.MessageType);
      } else {
        expect('MessageType' in body).toBe(false);
      }
      if (input.DryRun) {
        expect(body.DryRun).toBe(true);
      } else {
        expect('DryRun' in body).toBe(false);
      }
      if (input.GrantTokens !== undefined && input.GrantTokens.length > 0) {
        expect(body.GrantTokens).toEqual(input.GrantTokens);
      } else {
        expect('GrantTokens' in body).toBe(false);
      }
    },
  );
});

describe('Property: signature is deterministic for identical inputs', () => {
  it.prop([signInputArb], { numRuns: 100 })(
    'two calls with the same input produce the same signature',
    async (input) => {
      const c1 = new KmsClient(CFG);
      const c2 = new KmsClient(CFG);
      const r1 = await c1.debugSign(input);
      const r2 = await c2.debugSign(input);
      expect(r1.signature).toBe(r2.signature);
    },
  );
});
