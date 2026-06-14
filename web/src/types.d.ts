import type { Registry } from '@wpm/db';

declare module 'hono' {
  interface ContextVariableMap {
    repos: Registry;
    cspNonce: string;
  }
}
