// oxlint-disable no-console

export const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

export type Level = keyof typeof LEVELS;
export type Fields = Record<string, unknown>;

function needsEscape(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x20 || c === 0x22 || c === 0x5c) {
      return true;
    }
  }
  return false;
}

function jstr(s: unknown): string {
  const str = typeof s === 'string' ? s : String(s);
  return needsEscape(str) ? JSON.stringify(str) : `"${str}"`;
}

function isError(v: unknown): v is Error {
  if (v instanceof Error) {
    return true;
  }

  // @ts-expect-error -- duck-typing for cross-realm errors
  if (!v || typeof v.message !== 'string' || typeof v.stack !== 'string') {
    return false;
  }

  return Object.prototype.toString.call(v) === '[object Error]';
}

function appendField(line: string, key: string, v: unknown): string {
  const k = needsEscape(key) ? `,${JSON.stringify(key)}:` : `,"${key}":`;

  switch (typeof v) {
    case 'string':
      return line + k + jstr(v);
    case 'number':
      return line + k + (Number.isFinite(v) ? v : 'null');
    case 'boolean':
      return line + k + (v ? 'true' : 'false');
    case 'bigint':
      // oxlint-disable-next-line prefer-template -- kept for performance reasons
      return line + k + '"' + v.toString() + '"';
    case 'undefined':
    case 'function':
    case 'symbol':
      return line;
    case 'object': {
      if (v == null) {
        return `${line + k}null`;
      }

      if (isError(v)) {
        // prettier-ignore
        // oxlint-disable-next-line prefer-template -- kept for performance reasons
        return line + k + `{"name":${jstr(v.name || 'Error')},"message":${jstr(v.message || '')}${
          v.stack ? `,"stack":${jstr(v.stack)}` : ''
        }}`;
      }

      let valStr: string | undefined;
      try {
        valStr = JSON.stringify(v);
      } catch {
        // oxlint-disable-next-line prefer-template -- kept for performance reasons
        return line + k + '"[unserializable]"';
      }

      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (valStr === undefined) {
        return line;
      }

      return line + k + valStr;
    }
    default:
      return line;
  }
}

export class Logger {
  private readonly min: number;
  private readonly ctx: string;

  constructor(min: number, ctx: string) {
    this.min = min;
    this.ctx = ctx;
  }

  child(bindings: Fields): Logger {
    let frag = '';
    for (const k in bindings) {
      frag = appendField(frag, k, bindings[k]);
    }
    return new Logger(this.min, this.ctx + frag);
  }

  enabled(level: Level): boolean {
    return LEVELS[level] >= this.min;
  }

  private build(level: string, msg: string, fields?: Fields): string {
    let line = `{"level":"${level}","time":${Date.now()}${this.ctx},"msg":${jstr(msg)}`;
    if (fields !== undefined) {
      for (const k in fields) {
        line = appendField(line, k, fields[k]);
      }
    }
    return `${line}}`;
  }

  trace(msg: string, fields?: Fields): void {
    if (10 < this.min) {
      return;
    }
    console.debug(this.build('trace', msg, fields));
  }
  debug(msg: string, fields?: Fields): void {
    if (20 < this.min) {
      return;
    }
    console.debug(this.build('debug', msg, fields));
  }
  info(msg: string, fields?: Fields): void {
    if (30 < this.min) {
      return;
    }
    console.info(this.build('info', msg, fields));
  }
  warn(msg: string, fields?: Fields): void {
    if (40 < this.min) {
      return;
    }
    console.warn(this.build('warn', msg, fields));
  }
  error(msg: string, fields?: Fields): void {
    if (50 < this.min) {
      return;
    }
    console.error(this.build('error', msg, fields));
  }
  fatal(msg: string, fields?: Fields): void {
    if (60 < this.min) {
      return;
    }
    console.error(this.build('fatal', msg, fields));
  }
}

export type LoggerOptions = {
  level?: Level;
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  return new Logger(LEVELS[opts.level ?? 'info'], '');
}
