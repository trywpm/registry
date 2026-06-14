import type { Registry } from '@wpm/db';

declare module 'hono' {
  interface ContextVariableMap {
    cspNonce: string;
    registry: Registry;
  }
}
