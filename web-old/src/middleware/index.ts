import postgres from 'postgres';

import { env } from 'cloudflare:workers';
import { sequence } from 'astro:middleware';

import type { APIContext, MiddlewareNext } from 'astro';

async function db(ctx: APIContext, next: MiddlewareNext) {
  const pg = postgres(env.pg.connectionString, {
    max: 5,
    idle_timeout: 10,
    fetch_types: false,
  });

  ctx.locals.db = pg;

  const res = await next();

  ctx.locals.cfContext.waitUntil(pg.end());

  return res;
}

export const onRequest = sequence(db);
