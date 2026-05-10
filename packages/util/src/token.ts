import { Buffer } from 'node:buffer';

const PREFIX = 'wpm_';
const MAX_LEN = 128;
const TOKEN_RANDOM_LEN = 60;

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
    length = TOKEN_RANDOM_LEN;
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
  return PREFIX + randString(TOKEN_RANDOM_LEN);
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

export async function getAuthTokenHash(token: string, hmacKey: string): Promise<string> {
  if (token.startsWith(PREFIX)) {
    token = token.slice(PREFIX.length);
  }

  const key = await getHmacKey(hmacKey);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token));

  return Buffer.from(sig).toString('base64url');
}
