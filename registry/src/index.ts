import { Hono } from 'hono';
import { Presigner } from '@wpm/util/s3';
import { isValidPackageName, isValidSemver } from '@wpm/util/validation';

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal server error' }, 500);
});

app.get('/-/whoami', (c) => {
  return c.text('anonymous');
});

app.get('/:package', async (c) => {
  const { package: name } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'not found' }, 404);
  }

  const pkg = await c.env.manifest.get(name);
  if (!pkg) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json(pkg);
});

app.get('/:package/:filename', async (c) => {
  const { package: name, filename } = c.req.param();
  if (!isValidPackageName(name)) {
    return c.json({ error: 'not found' }, 404);
  }

  if (!filename.endsWith('.tar.zst')) {
    return c.json({ error: 'not found' }, 404);
  }

  const version = filename.replace('.tar.zst', '');
  if (!isValidSemver(version)) {
    return c.json({ error: 'not found' }, 404);
  }

  const p = new Presigner({
    region: c.env.AWS_REGION,
    bucket: c.env.S3_BUCKET,
    endpoint: c.env.AWS_ENDPOINT_URL,
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
  });

  const url = await p.get({
    // This endpoint sits behind a top-level Cloudflare Snippet proxy.
    // Public packages are served directly at the edge and never reach here.
    //
    // If execution reaches this point, we can assume one of two things:
    // 1. The request is for a private package, or
    // 2. The requested file does not exist in the S3 bucket
    //    (for example, request to non-existent or a deleted package).
    //
    // In either case, we generate a signed URL and let the Cloudflare
    // layer handle the final response flow.
    key: `private-packages/${name}/${version}.tar.zst`,
    expiresIn: 3600,
  });

  return c.redirect(url, 302);
});

export default {
  fetch: app.fetch,
};
