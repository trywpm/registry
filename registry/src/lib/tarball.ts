import type { Package } from '@wpm/manifest';

import { ChecksumMismatchError } from '@wpm/exception';

import { getPresigner } from '@/lib/presigner';

export async function uploadToStaging(
  env: Cloudflare.Env,
  stagingKey: string,
  tarballStream: ReadableStream,
  dist: Package['dist'],
): Promise<void> {
  const res = await getPresigner(env).upload({
    key: stagingKey,
    retries: 0,
    expiresIn: 60,
    sha256: dist.digest.slice(7),
    contentLength: dist.packedSize,
    contentType: 'application/octet-stream',
    body: () => tarballStream,
  });

  if (res.ok) {
    return;
  }

  const body = await res.text();
  if (body.includes('BadDigest') || body.includes('InvalidDigest')) {
    throw new ChecksumMismatchError(stagingKey);
  }

  throw new Error(`staging upload failed: ${res.status} ${body}`);
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
