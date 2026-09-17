import type { RequestContext } from '@/lib/context';

import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

import { json } from '@/http';

export async function health(ctx: RequestContext): Promise<Response> {
  const actual = Buffer.from(ctx.env.HEALTH_KEY);
  const expected = Buffer.from(ctx.req.headers.get('X-Health-Key') ?? '');
  if (
    actual.length === 0 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    await ctx.repos.ping();
    return new Response(null, { status: 200 });
  } catch (err) {
    ctx.logger().error('health check failed', { err });
    return new Response(null, { status: 500 });
  }
}
