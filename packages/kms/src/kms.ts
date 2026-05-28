/* cspell:words RSASSA */
import { Buffer } from 'node:buffer';

const ALGO = 'AWS4-HMAC-SHA256';
const SERVICE = 'kms';
const TERMINATOR = 'aws4_request';
const TARGET = 'TrentService.Sign';
const CONTENT_TYPE = 'application/x-amz-json-1.1';
const ENCODER = new TextEncoder();
const HMAC_PARAMS: HmacImportParams = { name: 'HMAC', hash: 'SHA-256' };

const RETRYABLE_ERRORS = new Set([
  'DependencyTimeoutException',
  'KeyUnavailableException',
  'KMSInternalException',
  'ThrottlingException',
]);

function bytesToHex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('hex');
}
function bytesToB64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}
function b64ToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

async function hmacRaw(keyData: BufferSource, msg: string): Promise<ArrayBuffer> {
  const ck = await crypto.subtle.importKey('raw', keyData, HMAC_PARAMS, false, ['sign']);
  return crypto.subtle.sign('HMAC', ck, ENCODER.encode(msg));
}

type AmzDate = { readonly ymd: string; readonly amzDate: string };

function nowAmzDate(clock: (() => number) | null): AmzDate {
  const iso = (clock != null ? new Date(clock()) : new Date()).toISOString();
  const ymd = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  const amzDate = `${ymd}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { ymd, amzDate };
}

type DailyCache = {
  readonly ymd: string;
  readonly scope: string;
  readonly credential: string;
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
  const credential = `${accessKeyId}/${scope}`;
  return { ymd, scope, credential, signingKey };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type KmsConfig = {
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly endpoint?: string;
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;

  // used in tests only
  readonly clock?: () => number;
};

export type SigningAlgorithm =
  | 'RSASSA_PSS_SHA_256'
  | 'RSASSA_PSS_SHA_384'
  | 'RSASSA_PSS_SHA_512'
  | 'RSASSA_PKCS1_V1_5_SHA_256'
  | 'RSASSA_PKCS1_V1_5_SHA_384'
  | 'RSASSA_PKCS1_V1_5_SHA_512'
  | 'ECDSA_SHA_256'
  | 'ECDSA_SHA_384'
  | 'ECDSA_SHA_512'
  | 'SM2DSA'
  | 'ML_DSA_SHAKE_256'
  | 'ED25519_SHA_512'
  | 'ED25519_PH_SHA_512';

export type MessageType = 'RAW' | 'DIGEST' | 'EXTERNAL_MU';

export type SignInput = {
  readonly KeyId: string;
  readonly Message: Uint8Array;
  readonly SigningAlgorithm: SigningAlgorithm;
  readonly MessageType?: MessageType;
  readonly DryRun?: boolean;
  readonly GrantTokens?: readonly string[];
};

export type SignOutput = {
  readonly KeyId: string;
  readonly Signature: Uint8Array;
  readonly SigningAlgorithm: SigningAlgorithm;
};

export type BuiltRequest = {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly signature: string;
  readonly signedHeaders: string;
  readonly amzDate: string;
  readonly ymd: string;
};

export class KmsError extends Error {
  public readonly httpStatus: number;
  public readonly errorType: string;

  constructor(message: string, errorType: string, httpStatus: number) {
    super(message);
    this.name = errorType || 'KmsError';
    this.errorType = errorType;
    this.httpStatus = httpStatus;
  }
}

export class KmsClient {
  public readonly host: string;

  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken: string | null;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly clock: (() => number) | null;

  private cache: DailyCache | null = null;
  private inflight: Promise<DailyCache> | null = null;

  constructor(cfg: KmsConfig) {
    if (
      cfg.region.length === 0 ||
      cfg.accessKeyId.length === 0 ||
      cfg.secretAccessKey.length === 0
    ) {
      throw new Error(
        'KmsClient: region, accessKeyId, and secretAccessKey are required and must be non-empty strings',
      );
    }
    if (cfg.endpoint !== undefined && cfg.endpoint.endsWith('/')) {
      throw new Error('KmsClient: endpoint must not have a trailing slash');
    }

    this.region = cfg.region;
    this.accessKeyId = cfg.accessKeyId;
    this.secretAccessKey = cfg.secretAccessKey;
    this.sessionToken = cfg.sessionToken ?? null;
    this.maxRetries = cfg.maxRetries ?? 3;
    this.retryBaseDelayMs = cfg.retryBaseDelayMs ?? 100;
    this.clock = cfg.clock ?? null;

    if (cfg.endpoint !== undefined) {
      const e = new URL(cfg.endpoint);
      if (e.protocol !== 'https:' && e.protocol !== 'http:') {
        throw new Error('KmsClient: endpoint must have http or https scheme');
      }
      this.host = e.host;
    } else {
      this.host = `kms.${cfg.region}.amazonaws.com`;
    }
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

  private async build(input: SignInput): Promise<BuiltRequest> {
    if (typeof input.KeyId !== 'string' || input.KeyId.length === 0) {
      throw new Error('KmsClient: KeyId must be a non-empty string');
    }

    const payload: Record<string, unknown> = {
      KeyId: input.KeyId,
      Message: bytesToB64(input.Message),
      SigningAlgorithm: input.SigningAlgorithm,
    };
    if (input.MessageType !== undefined) {
      payload.MessageType = input.MessageType;
    }
    if (input.DryRun === true) {
      payload.DryRun = true;
    }
    if (input.GrantTokens !== undefined && input.GrantTokens.length > 0) {
      payload.GrantTokens = input.GrantTokens;
    }

    const bodyText = JSON.stringify(payload);
    const bodyBytes = ENCODER.encode(bodyText);
    const payloadHash = bytesToHex(await crypto.subtle.digest('SHA-256', bodyBytes));

    const { ymd, amzDate } = nowAmzDate(this.clock);
    const dailyOrPromise = this.getDaily(ymd);
    const daily: DailyCache =
      dailyOrPromise instanceof Promise ? await dailyOrPromise : dailyOrPromise;

    let signedHeaders = 'content-type;host;x-amz-date';
    let canonicalHeaders = `content-type:${CONTENT_TYPE}\nhost:${this.host}\nx-amz-date:${amzDate}\n`;

    if (this.sessionToken != null) {
      signedHeaders += ';x-amz-security-token';
      canonicalHeaders += `x-amz-security-token:${this.sessionToken}\n`;
    }

    signedHeaders += ';x-amz-target';
    canonicalHeaders += `x-amz-target:${TARGET}\n`;

    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const crHash = bytesToHex(
      await crypto.subtle.digest('SHA-256', ENCODER.encode(canonicalRequest)),
    );
    const stringToSign = `${ALGO}\n${amzDate}\n${daily.scope}\n${crHash}`;
    const signature = bytesToHex(
      await crypto.subtle.sign('HMAC', daily.signingKey, ENCODER.encode(stringToSign)),
    );

    const authorization = `${ALGO} Credential=${daily.credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const requestHeaders: Record<string, string> = {
      'content-type': CONTENT_TYPE,
      'x-amz-date': amzDate,
      'x-amz-target': TARGET,
      authorization,
    };
    if (this.sessionToken != null) {
      requestHeaders['x-amz-security-token'] = this.sessionToken;
    }

    return {
      url: `https://${this.host}/`,
      method: 'POST',
      headers: requestHeaders,
      bodyText,
      canonicalRequest,
      stringToSign,
      signature,
      signedHeaders,
      amzDate,
      ymd,
    };
  }

  async sign(input: SignInput): Promise<SignOutput> {
    const req = await this.build(input);
    return this.send(req.url, req.headers, req.bodyText);
  }

  // test only helper. Not exported from module.
  debugSign(input: SignInput): Promise<BuiltRequest> {
    return this.build(input);
  }

  private async send(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<SignOutput> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers, body });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(
            (1 << attempt) * this.retryBaseDelayMs + Math.random() * this.retryBaseDelayMs,
          );
          attempt++;
          continue;
        }
        throw err;
      }

      if (res.ok) {
        const out: {
          KeyId: string;
          Signature: string;
          SigningAlgorithm: SigningAlgorithm;
        } = await res.json();
        return {
          KeyId: out.KeyId,
          Signature: b64ToBytes(out.Signature),
          SigningAlgorithm: out.SigningAlgorithm,
        };
      }

      const text = await res.text();
      let errType = '';
      let errMessage = text;
      try {
        const parsed = JSON.parse(text);
        errType = (parsed.__type ?? '').split('#').pop() ?? '';
        errMessage = parsed.message ?? parsed.Message ?? text;
      } catch {
        // not JSON
      }

      const retryable =
        attempt < this.maxRetries &&
        (RETRYABLE_ERRORS.has(errType) || res.status === 429 || res.status >= 500);

      if (retryable) {
        await sleep((1 << attempt) * this.retryBaseDelayMs + Math.random() * this.retryBaseDelayMs);
        attempt++;
        continue;
      }

      throw new KmsError(errMessage, errType, res.status);
    }
  }
}
