import type { UserWithToken } from '@wpm/db';

import { Logger } from '@wpm/logger';
import { Registry } from '@wpm/db';

import { authenticate } from '@/lib/auth';

let baseLogger: Logger | undefined;

export class RequestContext {
  readonly req: Request;
  readonly env: Cloudflare.Env;
  readonly ctx: ExecutionContext;

  #user: Promise<UserWithToken | Response | null> | undefined;
  #repos: Registry | undefined;
  #logger: Logger | undefined;
  #requestId: string | undefined;

  constructor(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    this.req = req;
    this.env = env;
    this.ctx = ctx;
  }

  waitUntil(promise: Promise<unknown>): void {
    this.ctx.waitUntil(promise);
  }

  get requestId(): string {
    return (this.#requestId ??= this.req.headers.get('Cf-Ray') ?? crypto.randomUUID());
  }

  get repos(): Registry {
    return (this.#repos ??= new Registry(this.env.cache, this.env.pg.connectionString));
  }

  auth(): Promise<UserWithToken | Response | null> {
    return (this.#user ??= authenticate(this));
  }

  logger(): Logger {
    baseLogger ??= new Logger(this.env.APP_ENV === 'development' ? 10 : 30, '');
    return (this.#logger ??= baseLogger.child({ requestId: this.requestId }));
  }
}
