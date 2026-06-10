import { Buffer } from 'node:buffer';

import type { Package } from '@wpm/manifest';

export async function uploadToStaging(
  env: Cloudflare.Env,
  stagingKey: string,
  tarballStream: ReadableStream,
  dist: Package['dist'],
): Promise<void> {
  const fls = new FixedLengthStream(dist.packedSize);
  await Promise.all([
    tarballStream.pipeTo(fls.writable),
    env.tarball.put(stagingKey, fls.readable, {
      sha256: Buffer.from(dist.digest.slice(7), 'base64'), // Remove "sha256:" prefix
    }),
  ]);
}

export function uploadErrorResponse(err: unknown, dist: Package['dist']): Response {
  if (err instanceof TypeError || /checksum|sha-?256/i.test(String(err))) {
    return Response.json(
      { error: `tarball does not match the declared packedSize or digest ${dist.digest}` },
      { status: 400 },
    );
  }

  return Response.json({ error: 'internal server error' }, { status: 500 });
}
