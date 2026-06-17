import { KmsClient } from '@wpm/kms';

import type { Package } from '@wpm/manifest';

const MAX_PAYLOAD_BYTES = 4096;
const ENCODER = new TextEncoder();

let kms: KmsClient | undefined;

/**
 * RFC 8785 (JCS)-compatible serialization of the dependencies map.
 *
 * This output is part of a cross-language signing contract: the resulting bytes
 * are hashed into the signature payload and must be reproduced exactly by all
 * implementations. Keys are serialized in UTF-16 code unit order and values are
 * JSON-escaped.
 */
export function canonicalDependencies(dependencies: Record<string, string>): string {
  return JSON.stringify(dependencies, Object.keys(dependencies).toSorted());
}

/**
 * Signature payload:
 *
 *   name:version:digest                user-facing, when dependencies are absent or {}
 *   name:version:digest:deps_digest    when dependencies are present
 */
async function signaturePayload(manifest: Package): Promise<Uint8Array> {
  const parts = [manifest.name, manifest.version, manifest.dist.digest];

  const deps = manifest.dependencies;
  if (deps && Object.keys(deps).length > 0) {
    const canonical = ENCODER.encode(canonicalDependencies(deps));
    const hash = await crypto.subtle.digest('SHA-256', canonical);
    parts.push(new Uint8Array(hash).toBase64());
  }

  const payload = parts.join(':');
  const bytes = ENCODER.encode(payload);

  if (bytes.byteLength >= MAX_PAYLOAD_BYTES) {
    throw new Error('signature payload exceeds the KMS raw message limit');
  }

  return bytes;
}

/** Sign the manifest with KMS and attach the signature to it. */
export async function signManifest(env: Cloudflare.Env, manifest: Package): Promise<void> {
  kms ??= new KmsClient({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    endpoint: env.AWS_ENDPOINT_URL ? env.AWS_ENDPOINT_URL : undefined,
    maxRetries: 2,
    requestTimeoutMs: 5_000,
  });

  const res = await kms.sign({
    KeyId: env.SIG_KEY_ID,
    Message: await signaturePayload(manifest),
    MessageType: 'RAW',
    SigningAlgorithm: 'ECDSA_SHA_256',
  });

  manifest.dist.signatures = [
    {
      sig: res.Signature.toBase64(),
      keyid: env.SIG_KEY_SPKI_FINGERPRINT, // SPKI fingerprint used to identify the public key for signature verification.
    },
  ];
}
