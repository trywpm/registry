import { Presigner } from '@wpm/storage';

let presigner: Presigner | undefined;

export function getPresigner(env: Cloudflare.Env): Presigner {
  return (presigner ??= new Presigner({
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET,
    endpoint: env.AWS_ENDPOINT_URL,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  }));
}
