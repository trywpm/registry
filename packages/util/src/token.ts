import { Buffer } from 'node:buffer';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

export function generateBearerToken(length: number = 64): string {
  if (length <= 0) {
    length = 64;
  }
  if (length > 128) {
    length = 128;
  }

  const bytes = new Uint8Array(length + 8);
  crypto.getRandomValues(bytes);

  let result = '';
  let cursor = 0;

  while (result.length < length) {
    if (cursor >= bytes.length) {
      crypto.getRandomValues(bytes);
      cursor = 0;
    }

    const byte = bytes[cursor++];
    if (byte < 252) {
      result += CHARSET[byte % 63];
    }
  }

  return result;
}

export async function generateBearerTokenHash(token: string, hmacKey: string): Promise<string> {
  if (token.startsWith('wpm_')) {
    token = token.slice(4);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(hmacKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const buf = await crypto.subtle.sign('HMAC', key, Buffer.from(token));

  return Buffer.from(buf).toString('base64url');
}
