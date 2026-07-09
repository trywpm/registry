import type { UserWithToken } from '@wpm/db';

import { Logger } from '@wpm/logger';
import { Registry } from '@wpm/db';

import { authenticate } from '@/lib/auth';

let baseLogger: Logger | undefined;

export class RequestContext {
  declare private _user: Promise<UserWithToken | Response | null> | undefined;
  declare private _repos: Registry | undefined;
  declare private _logger: Logger | undefined;
  declare private _requestId: string | undefined;

  constructor(
    readonly req: Request,
    readonly env: Cloudflare.Env,
    readonly ctx: ExecutionContext,
  ) {}

  waitUntil(promise: Promise<unknown>): void {
    this.ctx.waitUntil(promise);
  }

  get requestId(): string {
    return (this._requestId ??= this.req.headers.get('Cf-Ray') ?? crypto.randomUUID());
  }

  get repos(): Registry {
    return (this._repos ??= new Registry(this.env.cache, this.env.pg.connectionString));
  }

  auth(): Promise<UserWithToken | Response | null> {
    return (this._user ??= authenticate(this));
  }

  logger(): Logger {
    baseLogger ??= new Logger(this.env.APP_ENV === 'development' ? 10 : 30, '');
    return (this._logger ??= baseLogger.child({ requestId: this.requestId }));
  }
}
