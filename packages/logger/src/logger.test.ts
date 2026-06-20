import type { MockInstance } from 'vite-plus/test';

import type { Fields, Level } from './logger';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createLogger, LEVELS } from './logger';

const FIXED_TIME = 1_700_000_000_000;

const ROUTING: Record<Level, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

const ALL_LEVELS = Object.keys(LEVELS).filter((k): k is Level => k in LEVELS);
const LEVEL_MATRIX: Array<{ loggerLevel: Level; method: Level }> = ALL_LEVELS.flatMap(
  (loggerLevel) => ALL_LEVELS.map((method) => ({ loggerLevel, method })),
);

let spies: Record<'debug' | 'info' | 'warn' | 'error', MockInstance>;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME);
  spies = {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function totalCalls(): number {
  return (
    spies.debug.mock.calls.length +
    spies.info.mock.calls.length +
    spies.warn.mock.calls.length +
    spies.error.mock.calls.length
  );
}

function argString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('expected the logged argument to be a string line');
  }
  return value;
}

function lineFrom(channel: 'debug' | 'info' | 'warn' | 'error'): string {
  const calls = spies[channel].mock.calls;
  expect(calls.length).toBe(1);
  return argString(calls[0][0]);
}

function emit(fields?: Fields, msg = 'm') {
  const log = createLogger({ level: 'trace' });
  log.info(msg, fields);
  const line = lineFrom('info');
  return { line, obj: JSON.parse(line) };
}

describe('string serialization (jstr)', () => {
  it('takes the fast path for clean strings (no JSON.stringify quoting)', () => {
    const { line, obj } = emit(undefined, 'hello world');
    expect(line).toContain('"msg":"hello world"');
    expect(obj.msg).toBe('hello world');
  });

  it('escapes quotes, backslashes and control chars via the slow path', () => {
    const tricky = 'a"b\\c\nd\te';
    const { line, obj } = emit(undefined, tricky);

    expect(obj.msg).toBe(tricky);
    expect(line).toContain('\\"');
    expect(line).toContain('\\\\');
    expect(line).toContain('\\n');
    expect(line).toContain('\\t');
  });
});

describe('msg coercion fallback (jstr)', () => {
  it('coerces a number to a string', () => {
    // @ts-expect-error test the fallback coercion
    const { line, obj } = emit(undefined, 404);

    expect(obj.msg).toBe('404');
    expect(line).toContain('"msg":"404"');
  });

  it('coerces null to "null"', () => {
    // @ts-expect-error test the fallback coercion
    const { obj, line } = emit(undefined, null);

    expect(obj.msg).toBe('null');
    expect(line).toContain('"msg":"null"');
  });

  it('coerces an object to "[object Object]"', () => {
    // @ts-expect-error test the fallback coercion
    const { obj, line } = emit(undefined, { foo: 'bar' });

    expect(obj.msg).toBe('[object Object]');
    expect(line).toContain('"msg":"[object Object]"');
  });

  it('coerces undefined to "undefined"', () => {
    spies.info.mockClear();
    const log = createLogger({ level: 'trace' });

    // @ts-expect-error test the fallback coercion
    log.info(undefined);

    const line = argString(spies.info.mock.calls[0][0]);
    const obj = JSON.parse(line);

    expect(obj.msg).toBe('undefined');
    expect(line).toContain('"msg":"undefined"');
  });
});

describe('appendField — primitives', () => {
  it('serializes finite numbers (int, float, negative, zero)', () => {
    const { obj } = emit({ a: 42, b: 3.14, c: -7, d: 0 });
    expect(obj).toMatchObject({ a: 42, b: 3.14, c: -7, d: 0 });
  });

  it('writes null for every non-finite number', () => {
    const { line, obj } = emit({ nan: NaN, inf: Infinity, ninf: -Infinity });
    expect(obj).toEqual(expect.objectContaining({ nan: null, inf: null, ninf: null }));
    expect(line).toContain('"nan":null');
    expect(line).toContain('"inf":null');
    expect(line).toContain('"ninf":null');
  });

  it('serializes booleans', () => {
    const { line, obj } = emit({ t: true, f: false });
    expect(obj).toMatchObject({ t: true, f: false });
    expect(line).toContain('"t":true');
    expect(line).toContain('"f":false');
  });

  it('serializes bigint as a quoted string', () => {
    const { line, obj } = emit({ big: 9007199254740993n });
    expect(line).toContain('"big":"9007199254740993"');
    expect(obj.big).toBe('9007199254740993');
  });

  it('serializes null as JSON null', () => {
    const { line, obj } = emit({ n: null });
    expect(line).toContain('"n":null');
    expect(obj.n).toBeNull();
  });

  it('omits undefined, function and symbol values entirely', () => {
    const { obj } = emit({
      u: undefined,
      fn: () => 1,
      sym: Symbol('x'),
      keep: 'yes',
    });
    expect(obj).not.toHaveProperty('u');
    expect(obj).not.toHaveProperty('fn');
    expect(obj).not.toHaveProperty('sym');
    expect(obj.keep).toBe('yes'); // proves only the bad keys were dropped
  });
});

describe('appendField — key escaping', () => {
  it('emits clean keys without quoting machinery', () => {
    const { line } = emit({ requestId: 'x' });
    expect(line).toContain('"requestId":"x"');
  });

  it('escapes keys containing a quote', () => {
    const { line, obj } = emit({ 'a"b': 1 });
    expect(obj['a"b']).toBe(1);
    expect(line).toContain('"a\\"b":1');
  });

  it('escapes keys containing a control char', () => {
    const key = 'a\nb';
    const { line, obj } = emit({ [key]: 1 });
    expect(obj[key]).toBe(1);
    expect(line).toContain('"a\\nb":1');
  });
});

describe('appendField — objects & arrays', () => {
  it('serializes nested objects and arrays via JSON.stringify', () => {
    const value = { nested: { deep: [1, 2, { x: true }] }, arr: ['a', 'b'] };
    const { obj } = emit(value);
    expect(obj.nested).toEqual(value.nested);
    expect(obj.arr).toEqual(value.arr);
  });

  it('serializes a Date through its toJSON (ISO string)', () => {
    const { obj } = emit({ when: new Date(0) });
    expect(obj.when).toBe('1970-01-01T00:00:00.000Z');
  });

  it('writes "[unserializable]" for a circular reference', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    const { line, obj } = emit({ bad: circular });
    expect(line).toContain('"bad":"[unserializable]"');
    expect(obj.bad).toBe('[unserializable]');
  });

  it('drops a field whose value JSON.stringifies to undefined (toJSON → undefined)', () => {
    const { obj } = emit({ ghost: { toJSON: () => undefined }, keep: 1 });
    expect(obj).not.toHaveProperty('ghost');
    expect(obj.keep).toBe(1);
  });
});

describe('Error serialization', () => {
  it('serializes a real Error with name, message and stack', () => {
    const { obj } = emit({ err: new TypeError('boom') });
    expect(obj.err.name).toBe('TypeError');
    expect(obj.err.message).toBe('boom');
    expect(typeof obj.err.stack).toBe('string');
    expect(obj.err.stack.length).toBeGreaterThan(0);
  });

  it('omits the stack key when the Error has no stack', () => {
    const e = new Error('no-stack');
    delete (e as { stack?: string }).stack;
    const { line, obj } = emit({ err: e });
    expect(obj.err.message).toBe('no-stack');
    expect(obj.err).not.toHaveProperty('stack');
    expect(line).not.toContain('"stack"');
  });

  it('falls back to "Error" when name is empty', () => {
    const e = new Error('m');
    e.name = '';
    const { obj } = emit({ err: e });
    expect(obj.err.name).toBe('Error');
  });

  it('serializes an empty message as an empty string', () => {
    const { obj } = emit({ err: new Error('') });
    expect(obj.err.message).toBe('');
  });

  it('treats a cross-realm-like error (Symbol.toStringTag = Error) as an Error', () => {
    const fake = {
      name: 'RpcError',
      message: 'remote failure',
      stack: 'RpcError: remote failure\n    at <remote>',
      [Symbol.toStringTag]: 'Error',
    };
    const { obj } = emit({ err: fake });
    expect(obj.err.name).toBe('RpcError');
    expect(obj.err.message).toBe('remote failure');
    expect(obj.err.stack).toContain('<remote>');
  });

  it('does NOT treat a plain decoy object with message/stack as an Error', () => {
    const decoy = { message: 'looks like one', stack: 'fake stack', extra: 99 };
    const { obj } = emit({ x: decoy });
    expect(obj.x).toEqual(decoy);
    expect(obj.x.extra).toBe(99);
  });
});

describe('Logger.child', () => {
  it('adds no fields for empty bindings', () => {
    const child = createLogger({ level: 'trace' }).child({});
    child.info('m');
    const obj = JSON.parse(lineFrom('info'));
    expect(Object.keys(obj).toSorted()).toEqual(['level', 'msg', 'time']);
  });

  it('attaches a single binding to the line', () => {
    const child = createLogger({ level: 'trace' }).child({ requestId: 'r1' });
    child.info('m');
    expect(JSON.parse(lineFrom('info')).requestId).toBe('r1');
  });

  it('accumulates bindings across nested children', () => {
    const log = createLogger({ level: 'trace' })
      .child({ requestId: 'r1' })
      .child({ component: 'db' });
    log.info('m');
    const obj = JSON.parse(lineFrom('info'));
    expect(obj.requestId).toBe('r1');
    expect(obj.component).toBe('db');
  });

  it('inherits the parent threshold', () => {
    const child = createLogger({ level: 'warn' }).child({ requestId: 'r1' });
    child.info('suppressed'); // info < warn
    child.warn('kept');
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
  });

  it('serializes bindings once at child() time (later mutation has no effect)', () => {
    const src: Fields = { requestId: 'first' };
    const child = createLogger({ level: 'trace' }).child(src);
    src.requestId = 'second'; // mutate AFTER creating the child
    child.info('m');
    expect(JSON.parse(lineFrom('info')).requestId).toBe('first');
  });

  it('escapes binding keys and values correctly', () => {
    const child = createLogger({ level: 'trace' }).child({ 'a\nb': 'v"v' });
    child.info('m');
    const obj = JSON.parse(lineFrom('info'));
    expect(obj['a\nb']).toBe('v"v');
  });

  it('returns a fresh logger and leaves the parent untouched', () => {
    const parent = createLogger({ level: 'trace' });
    parent.child({ requestId: 'r1' });
    parent.info('m');
    const obj = JSON.parse(lineFrom('info'));
    expect(obj).not.toHaveProperty('requestId');
  });
});

describe('enabled()', () => {
  it.each([
    ['trace', false],
    ['debug', false],
    ['info', true],
    ['warn', true],
    ['error', true],
    ['fatal', true],
  ] as Array<[Level, boolean]>)('info logger: enabled(%s) === %s', (level, expected) => {
    expect(createLogger({ level: 'info' }).enabled(level)).toBe(expected);
  });

  it.each(LEVEL_MATRIX)(
    'logger@$loggerLevel: enabled($method) matches whether .$method() emits',
    ({ loggerLevel, method }) => {
      const log = createLogger({ level: loggerLevel });
      const willLog = log.enabled(method);
      (log[method] as (m: string) => void)('m');
      expect(totalCalls()).toBe(willLog ? 1 : 0);
    },
  );
});

describe('level methods — threshold & console routing', () => {
  it.each(LEVEL_MATRIX)(
    'logger@$loggerLevel .$method() routes and gates correctly',
    ({ loggerLevel, method }) => {
      const log = createLogger({ level: loggerLevel });
      (log[method] as (m: string) => void)('m');

      const shouldLog = LEVELS[method] >= LEVELS[loggerLevel];
      if (shouldLog) {
        expect(totalCalls()).toBe(1);
        expect(spies[ROUTING[method]]).toHaveBeenCalledTimes(1);
        const line = argString(spies[ROUTING[method]].mock.calls[0][0]);
        expect(JSON.parse(line).level).toBe(method);
      } else {
        expect(totalCalls()).toBe(0);
      }
    },
  );
});

describe('build() envelope', () => {
  it('emits a minimal envelope with no fields', () => {
    const { line, obj } = emit();
    expect(obj).toEqual({ level: 'info', time: FIXED_TIME, msg: 'm' });
    expect(line.startsWith(`{"level":"info","time":${FIXED_TIME}`)).toBe(true);
    expect(line.endsWith('"msg":"m"}')).toBe(true);
  });

  it('reuses a logger across calls without leaking fields between them', () => {
    const log = createLogger({ level: 'trace' });
    log.info('first', { a: 1 });
    log.info('second', { b: 2 });
    const calls = spies.info.mock.calls;
    expect(calls.length).toBe(2);
    const first = JSON.parse(argString(calls[0][0]));
    const second = JSON.parse(argString(calls[1][0]));
    expect(first).toMatchObject({ msg: 'first', a: 1 });
    expect(first).not.toHaveProperty('b');
    expect(second).toMatchObject({ msg: 'second', b: 2 });
    expect(second).not.toHaveProperty('a');
  });

  it('orders fields as level, time, <ctx>, msg, <call fields>', () => {
    const log = createLogger({ level: 'trace' }).child({ requestId: 'r1' });
    log.info('hello', { extra: 'z' });
    const line = lineFrom('info');
    const iLevel = line.indexOf('"level"');
    const iTime = line.indexOf('"time"');
    const iCtx = line.indexOf('"requestId"');
    const iMsg = line.indexOf('"msg"');
    const iExtra = line.indexOf('"extra"');
    expect(iLevel).toBeLessThan(iTime);
    expect(iTime).toBeLessThan(iCtx);
    expect(iCtx).toBeLessThan(iMsg);
    expect(iMsg).toBeLessThan(iExtra);
  });
});

describe('reserved-key collisions (documented last-wins behavior)', () => {
  it('a call field named "msg" duplicates the key; parse takes the last', () => {
    const { line, obj } = emit({ msg: 'override' });
    expect(line.match(/"msg":/g)?.length).toBe(2);
    expect(obj.msg).toBe('override'); // last-wins
  });

  it('a binding named "level" duplicates the key; parse takes the last', () => {
    const child = createLogger({ level: 'trace' }).child({ level: 'BOGUS' });
    child.info('m');
    const line = lineFrom('info');
    expect(line.match(/"level":/g)?.length).toBe(2);
    expect(JSON.parse(line).level).toBe('BOGUS'); // last-wins
  });
});

describe('createLogger', () => {
  it('defaults to info when no options are given', () => {
    const log = createLogger();
    log.debug('x'); // below info
    log.info('y');
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit level', () => {
    const log = createLogger({ level: 'error' });
    log.warn('x'); // below error
    log.error('y');
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledTimes(1);
  });
});
