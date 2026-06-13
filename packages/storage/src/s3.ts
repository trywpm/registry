import { createHash } from 'node:crypto';

import { fetchWithRetry } from '@wpm/util';
import { ChecksumMismatchError } from '@wpm/exception';

const ALGO = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
const ENCODER = new TextEncoder();
const TERMINATOR = 'aws4_request';
const MAX_EXPIRES = 604800;
const HMAC_PARAMS: HmacImportParams = { name: 'HMAC', hash: 'SHA-256' };
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

const RE_WS = /\s+/g;
const RE_SLASH = /%2F/g;
const RE_EXTRA = /[!'()*]/g;
const encExtra = (c: string): string => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;

function s3UriEncodePath(s: string): string {
  return encodeURIComponent(s).replace(RE_SLASH, '/').replace(RE_EXTRA, encExtra);
}

function s3UriEncodeQuery(s: string): string {
  return encodeURIComponent(s).replace(RE_EXTRA, encExtra);
}

function bytesToHex(buf: ArrayBuffer): string {
  return new Uint8Array(buf).toHex();
}

type AmzDate = {
  readonly ymd: string;
  readonly amzDate: string;
};

function nowAmzDate(clock: (() => number) | null): AmzDate {
  const iso = (clock != null ? new Date(clock()) : new Date()).toISOString();
  const ymd = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  const amzDate = `${ymd}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { ymd, amzDate };
}

async function hmacRaw(keyData: BufferSource, msg: string): Promise<ArrayBuffer> {
  const ck = await crypto.subtle.importKey('raw', keyData, HMAC_PARAMS, false, ['sign']);
  return crypto.subtle.sign('HMAC', ck, ENCODER.encode(msg));
}

type DailyCache = {
  readonly ymd: string;
  readonly scope: string;
  readonly credentialQs: string;
  readonly signingKey: CryptoKey;
};

async function deriveDaily(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  ymd: string,
): Promise<DailyCache> {
  const k1 = await hmacRaw(ENCODER.encode(`AWS4${secretAccessKey}`), ymd);
  const k2 = await hmacRaw(k1, region);
  const k3 = await hmacRaw(k2, SERVICE);
  const k4 = await hmacRaw(k3, TERMINATOR);
  const signingKey = await crypto.subtle.importKey('raw', k4, HMAC_PARAMS, false, ['sign']);
  const scope = `${ymd}/${region}/${SERVICE}/${TERMINATOR}`;
  const credentialQs = encodeURIComponent(`${accessKeyId}/${scope}`);
  return { ymd, scope, credentialQs, signingKey };
}

type CanonicalHeaders = {
  readonly canonicalHeaders: string;
  readonly signedHeaders: string;
};

function buildCanonicalHeaders(headerMap: Map<string, string>): CanonicalHeaders {
  const entries = [...headerMap.entries()].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  let canonical = '';

  const names: string[] = [];
  for (const [n, v] of entries) {
    canonical += `${n}:${v.trim().replace(RE_WS, ' ')}\n`;
    names.push(n);
  }

  return { canonicalHeaders: canonical, signedHeaders: names.join(';') };
}

export type PresignerConfig = {
  readonly region?: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;

  // used in tests only
  readonly clock?: () => number;
};

export type GetArgs = {
  readonly key: string;
  readonly expiresIn: number;
};

export type PutArgs = {
  readonly key: string;
  readonly sha256?: string;
  readonly expiresIn: number;
  readonly contentType?: string;
  readonly ifNoneMatch?: boolean;
  readonly contentLength?: number;
};

export type PutResult = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
};

export type UploadArgs = PutArgs & {
  readonly body: () => BodyInit | Promise<BodyInit>;
  readonly retries?: number;
  /** In-process sha256 verification of the body. */
  readonly verifySha256?: string;
};

export type CopyArgs = {
  readonly from: string;
  readonly to: string;
  readonly expiresIn: number;
  readonly retries?: number;
  /** Used for zero copy move in Tigris; ignored by plain S3. */
  readonly rename?: boolean;
};

type Method = 'GET' | 'PUT' | 'DELETE';

type SignArgs = {
  readonly key: string;
  readonly method: Method;
  readonly expiresIn: number;
  readonly headers: Readonly<Record<string, string>> | null;
};

export type SignResult = {
  readonly url: string;
  readonly ymd: string;
  readonly amzDate: string;
  readonly signature: string;
  readonly stringToSign: string;
  readonly signedHeaders: string;
  readonly canonicalRequest: string;
};

export class Presigner {
  public readonly host: string;

  private readonly bucket: string;
  private readonly protocol: 'http:' | 'https:';
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly clock: (() => number) | null;

  private cache: DailyCache | null = null;
  private inflight: Promise<DailyCache> | null = null;

  constructor(cfg: PresignerConfig) {
    if (
      cfg.bucket.length === 0 ||
      cfg.endpoint.length === 0 ||
      cfg.accessKeyId.length === 0 ||
      cfg.secretAccessKey.length === 0
    ) {
      throw new Error(
        'Presigner: region, bucket, endpoint, accessKeyId, and secretAccessKey are required and must be non-empty strings',
      );
    }

    if (cfg.endpoint.endsWith('/')) {
      throw new Error('Presigner: endpoint must not have a trailing slash');
    }

    this.clock = cfg.clock ?? null;

    this.bucket = cfg.bucket;
    this.region = cfg.region || 'auto';
    this.accessKeyId = cfg.accessKeyId;
    this.secretAccessKey = cfg.secretAccessKey;

    const e = new URL(cfg.endpoint);
    if (e.protocol !== 'https:' && e.protocol !== 'http:') {
      throw new Error('Presigner: endpoint must have http or https scheme');
    }

    this.host = e.host;
    this.protocol = e.protocol;
  }

  private getDaily(ymd: string): DailyCache | Promise<DailyCache> {
    const c = this.cache;
    if (c != null && c.ymd === ymd) {
      return c;
    }
    if (this.inflight != null) {
      return this.inflight;
    }
    const p = deriveDaily(this.accessKeyId, this.secretAccessKey, this.region, ymd).then(
      (fresh: DailyCache): DailyCache => {
        this.cache = fresh;
        this.inflight = null;
        return fresh;
      },
      (err: unknown): never => {
        this.inflight = null;
        throw err;
      },
    );
    this.inflight = p;
    return p;
  }

  private async sign(args: SignArgs): Promise<SignResult> {
    const { method, key, expiresIn, headers } = args;

    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Presigner: key must be a non-empty string');
    }
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_EXPIRES) {
      throw new Error(`Presigner: expiresIn must be an integer in [1, ${MAX_EXPIRES}]`);
    }

    const encodedKey = s3UriEncodePath(key);
    const { ymd, amzDate } = nowAmzDate(this.clock);
    const dailyOrPromise = this.getDaily(ymd);
    const daily: DailyCache =
      dailyOrPromise instanceof Promise ? await dailyOrPromise : dailyOrPromise;

    const hmap = new Map<string, string>();
    hmap.set('host', this.host);
    if (headers != null) {
      for (const [k, v] of Object.entries(headers)) {
        hmap.set(k.toLowerCase(), v);
      }
    }

    const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(hmap);

    const canonicalQuery = `X-Amz-Algorithm=${ALGO}&X-Amz-Credential=${
      daily.credentialQs
    }&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=${s3UriEncodeQuery(
      signedHeaders,
    )}`;

    const canonicalRequest = `${method}\n/${this.bucket}/${encodedKey}\n${canonicalQuery}\n${canonicalHeaders}\n${
      signedHeaders
    }\n${UNSIGNED_PAYLOAD}`;

    const crHash = bytesToHex(
      await crypto.subtle.digest('SHA-256', ENCODER.encode(canonicalRequest)),
    );

    const stringToSign = `${ALGO}\n${amzDate}\n${daily.scope}\n${crHash}`;

    const signature = bytesToHex(
      await crypto.subtle.sign('HMAC', daily.signingKey, ENCODER.encode(stringToSign)),
    );

    const url = `${this.protocol}//${this.host}/${this.bucket}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;

    return { url, signedHeaders, canonicalRequest, stringToSign, amzDate, ymd, signature };
  }

  async get(args: GetArgs): Promise<string> {
    const r = await this.sign({
      key: args.key,
      method: 'GET',
      headers: null,
      expiresIn: args.expiresIn,
    });

    return r.url;
  }

  /**
   * PresignPut signs a PUT URL plus the headers the client must send.
   *
   * IMPORTANT — unhoistable headers:
   *   AWS SDK v3 by default *hoists* `x-amz-*` headers into query parameters
   *   when presigning. For digest-verifying headers this is broken: S3 only
   *   verifies `x-amz-checksum-sha256` when it arrives as a HEADER on the PUT
   *   request — if it's only in the URL, the check is silently skipped. The
   *   SDK v3 workaround is `unhoistableHeaders: new Set([...])`; the Go SDK
   *   workaround is `DisableHeaderHoisting = true`.
   *
   *   This presigner never hoists. Every signed header listed below appears
   *   in the canonical-headers section (and in X-Amz-SignedHeaders), never
   *   as a query parameter. The caller MUST send the returned `headers`
   *   verbatim on the actual PUT for the signature — and any digest check
   *   — to validate.
   */
  private buildPutHeaders(args: PutArgs): Record<string, string> {
    const headers: Record<string, string> = {};
    if (args.contentType !== undefined) {
      headers['content-type'] = args.contentType;
    }

    if (args.contentLength !== undefined) {
      headers['content-length'] = String(args.contentLength);
    }

    if (args.ifNoneMatch === true) {
      headers['if-none-match'] = '*';
    }

    if (args.sha256 !== undefined) {
      headers['x-amz-checksum-sha256'] = args.sha256;
      headers['x-amz-sdk-checksum-algorithm'] = 'SHA256';
    }

    return headers;
  }

  async put(args: PutArgs): Promise<PutResult> {
    const headers = this.buildPutHeaders(args);

    const r = await this.sign({
      key: args.key,
      method: 'PUT',
      headers,
      expiresIn: args.expiresIn,
    });

    return { url: r.url, headers: { ...headers, host: this.host } };
  }

  /**
   * Upload is a convenience wrapper around put that also sends the body
   * and optionally verifies the sha256 digest in-process.
   */
  async upload(args: UploadArgs): Promise<Response> {
    const headers = this.buildPutHeaders(args);
    let hash: ReturnType<typeof createHash> | undefined;

    const res = await fetchWithRetry(
      async () => {
        const r = await this.sign({
          key: args.key,
          method: 'PUT',
          headers,
          expiresIn: args.expiresIn,
        });

        let body = await args.body();
        if (args.verifySha256 !== undefined && body instanceof ReadableStream) {
          hash = createHash('sha256');
          const h = hash;
          body = body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                h.update(chunk);
                controller.enqueue(chunk);
              },
            }),
          );
        }

        return { url: r.url, init: { method: 'PUT', headers, body } };
      },
      { retries: args.retries },
    );

    // fetch resolves only after the body is fully sent ⇒ the hash is complete.
    if (res.ok && hash !== undefined && hash.digest('base64') !== args.verifySha256) {
      throw new ChecksumMismatchError(args.key);
    }

    return res;
  }

  /**
   * Copy the object.
   *
   * Pass rename to true if the copy should be a zero-copy move
   * (source removed) in Tigris; plain S3 ignores it and performs a byte copy.
   */
  async copy(args: CopyArgs): Promise<Response> {
    const headers: Record<string, string> = {
      'x-amz-copy-source': `${this.bucket}/${s3UriEncodePath(args.from)}`,
    };
    if (args.rename === true) {
      headers['x-tigris-rename'] = 'true';
    }

    const res = await fetchWithRetry(
      async () => {
        const r = await this.sign({
          key: args.to,
          method: 'PUT',
          headers,
          expiresIn: args.expiresIn,
        });
        return { url: r.url, init: { method: 'PUT', headers } };
      },
      { retries: args.retries },
    );

    // CopyObject can return 200 with an <Error> body on slow S3 copies. Tigris
    // rename is instant and returns cleanly, but surface the S3 case as failure.
    if (res.ok) {
      const text = await res.text();
      if (text.includes('<Error')) {
        return new Response(text, { status: 502 });
      }

      return new Response(null, { status: 200 });
    }

    return res;
  }

  /** Delete the object at `key`. */
  async del(key: string, expiresIn: number, retries?: number): Promise<Response> {
    return fetchWithRetry(
      async () => {
        const r = await this.sign({ key, method: 'DELETE', headers: null, expiresIn });
        return { url: r.url, init: { method: 'DELETE' } };
      },
      { retries },
    );
  }

  // test only helper. Not exported from module.
  debugSign(args: SignArgs): Promise<SignResult> {
    return this.sign(args);
  }
}
