const PREFIX = 'wpm_';
const MAX_LEN = 128;
const PAT_LENGTH = 64;
const TOKEN_RANDOM_LENGTH = 60;

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

const REJECT_THRESHOLD = 252;

const CHARSET_CODES = (() => {
  const codes = new Uint8Array(63);
  for (let i = 0; i < 63; i++) {
    codes[i] = CHARSET.charCodeAt(i);
  }
  return codes;
})();

const encoder = new TextEncoder();
const latin1Decoder = new TextDecoder('latin1');

export function randString(length: number): string {
  if (length <= 0) {
    length = TOKEN_RANDOM_LENGTH;
  }

  if (length > MAX_LEN) {
    length = MAX_LEN;
  }

  const SLACK = (length >> 2) + 8;
  const bytes = new Uint8Array(length + SLACK);
  crypto.getRandomValues(bytes);

  let cursor = 0;
  let written = 0;
  while (written < length) {
    if (cursor >= bytes.length) {
      crypto.getRandomValues(bytes.subarray(written));
      cursor = written;
    }
    const b = bytes[cursor++];
    if (b < REJECT_THRESHOLD) {
      bytes[written++] = CHARSET_CODES[b % 63];
    }
  }

  return latin1Decoder.decode(bytes.subarray(0, length));
}

export function generateWpmAuthToken(): string {
  return PREFIX + randString(PAT_LENGTH);
}

let cachedKey: Promise<CryptoKey> | null = null;
let cachedSecret: string | null = null;

function getHmacKey(hmacKey: string): Promise<CryptoKey> {
  if (cachedKey != null && cachedSecret === hmacKey) {
    return cachedKey;
  }

  cachedSecret = hmacKey;

  cachedKey = crypto.subtle
    .importKey('raw', encoder.encode(hmacKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .catch((err) => {
      if (cachedSecret === hmacKey) {
        cachedKey = null;
        cachedSecret = null;
      }
      throw err;
    });

  return cachedKey;
}

const HASH_CACHE_MAX = 1024;
const hashCache = new Map<string, Promise<string>>();

let hashCacheSecret: string | null = null;

async function computeAuthTokenHash(token: string, hmacKey: string): Promise<string> {
  const key = await getHmacKey(hmacKey);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token));

  return new Uint8Array(sig).toBase64({ alphabet: 'base64url', omitPadding: true });
}

export function getAuthTokenHash(token: string, hmacKey: string): Promise<string> {
  if (token.startsWith(PREFIX)) {
    token = token.slice(PREFIX.length);
  }

  if (hashCacheSecret !== hmacKey) {
    hashCache.clear();
    hashCacheSecret = hmacKey;
  }

  const hash = hashCache.getOrInsertComputed(token, () =>
    computeAuthTokenHash(token, hmacKey).catch((err: unknown) => {
      hashCache.delete(token);
      throw err;
    }),
  );

  if (hashCache.size > HASH_CACHE_MAX) {
    const oldest = hashCache.keys().next().value;
    if (oldest !== undefined) {
      hashCache.delete(oldest);
    }
  }

  return hash;
}

// ---------------------------------------
// Auth header parsing
// ---------------------------------------

// "Bearer " + "wpm_" + 64 chars = 7 + 4 + 64 = 75
const HEADER_LEN = 7 + PREFIX.length + PAT_LENGTH;

function isWordChar(c: number): boolean {
  return (
    (c >= 0x61 && c <= 0x7a) || // a-z
    (c >= 0x41 && c <= 0x5a) || // A-Z
    (c >= 0x30 && c <= 0x39) || // 0-9
    c === 0x5f // _
  );
}

export function parseBearerToken(authHeader: string): string | null {
  if (authHeader.length !== HEADER_LEN) {
    return null;
  }

  if (
    authHeader.charCodeAt(0) !== 0x42 || // B
    authHeader.charCodeAt(1) !== 0x65 || // e
    authHeader.charCodeAt(2) !== 0x61 || // a
    authHeader.charCodeAt(3) !== 0x72 || // r
    authHeader.charCodeAt(4) !== 0x65 || // e
    authHeader.charCodeAt(5) !== 0x72 || // r
    authHeader.charCodeAt(6) !== 0x20 // space
  ) {
    return null;
  }

  if (
    authHeader.charCodeAt(7) !== 0x77 || // w
    authHeader.charCodeAt(8) !== 0x70 || // p
    authHeader.charCodeAt(9) !== 0x6d || // m
    authHeader.charCodeAt(10) !== 0x5f // _
  ) {
    return null;
  }

  for (let i = 11; i < HEADER_LEN; i++) {
    if (!isWordChar(authHeader.charCodeAt(i))) {
      return null;
    }
  }

  return authHeader.slice(7); // 7 is length of "Bearer "
}
