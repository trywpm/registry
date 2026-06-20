import { fc, it } from '@fast-check/vitest';
import { describe, expect } from 'vite-plus/test';

import { isStrictSemver, isValidConstraint } from './index';

// A string that IS a valid strict semver by construction (no leading zeros,
// no 'v', valid prerelease/build, within the 256-char limit).
const num = fc.nat({ max: 1_000_000 }).map(String);
const alnumId = fc
  .stringMatching(/^[0-9A-Za-z-]+$/)
  .filter((s) => s.length > 0 && !(s.length > 1 && /^\d+$/.test(s) && s[0] === '0'));
const dotted = fc.array(alnumId, { minLength: 1, maxLength: 4 }).map((a) => a.join('.'));
const validStrictVersion = fc
  .tuple(
    num,
    num,
    num,
    fc.option(dotted, { nil: undefined }),
    fc.option(dotted, { nil: undefined }),
  )
  .map(
    ([a, b, c, pre, build]) => `${a}.${b}.${c}${pre ? `-${pre}` : ''}${build ? `+${build}` : ''}`,
  )
  .filter((s) => s.length <= 256);

// A valid CONSTRAINT: operator + version/x-range comparators, joined into AND
// groups (space or comma) and OR groups (`||`), plus hyphen ranges. All forms
// here are accepted by Masterminds; bounded to the 512-char constraint limit.
const validOp = fc.constantFrom('', '=', '!=', '>', '<', '>=', '<=', '=>', '=<', '~', '~>', '^');
const xrange = fc.constantFrom(
  '1',
  '2.3',
  '1.x',
  '2.*',
  '1.2.x',
  '0.X',
  '10.20.30',
  '1.2',
  '4.5.6',
);
const optSpace = fc.constantFrom('', ' ', '  ');
const comparator = fc
  .tuple(validOp, optSpace, fc.oneof(validStrictVersion, xrange))
  .map(([op, s, v]) => op + (op ? s : '') + v);
const andSep = fc.constantFrom(' ', '  ', ', ', ',', ' , ');
const andGroup = fc.array(comparator, { minLength: 1, maxLength: 4 }).chain((cs) =>
  fc
    .array(andSep, {
      minLength: Math.max(0, cs.length - 1),
      maxLength: Math.max(0, cs.length - 1),
    })
    .map((seps) => cs.reduce((acc, c, i) => (i ? acc + seps[i - 1] + c : c), '')),
);
const hyphenRange = fc
  .tuple(fc.oneof(validStrictVersion, xrange), fc.oneof(validStrictVersion, xrange))
  .map(([a, b]) => `${a} - ${b}`);
const validConstraint = fc
  .array(fc.oneof(andGroup, hyphenRange), { minLength: 1, maxLength: 3 })
  .map((groups) => groups.join(' || '))
  .filter((s) => s.length <= 512);

// Strings that are INVALID by construction (Masterminds rejects all of these).
const fourPartVersion = fc.tuple(num, num, num, num).map((p) => p.join('.'));
const leadingZeroVersion = fc
  .tuple(fc.integer({ min: 1, max: 99 }), num, num)
  .map(([a, b, c]) => `0${a}.${b}.${c}`);
const danglingCommaConstraint = validConstraint.map((c) => `${c},`);

// Arbitrary text likely to probe the parser: semver-ish characters plus
// whitespace, operators, separators.
const semverishChar = fc.constantFrom(
  '0',
  '1',
  '9',
  '.',
  '-',
  '+',
  'x',
  'X',
  '*',
  'v',
  'a',
  'b',
  ' ',
  '|',
  ',',
  '<',
  '>',
  '=',
  '~',
  '^',
  '!',
  '\t',
  '\n',
);
const semverishString = fc
  .array(semverishChar, { minLength: 0, maxLength: 64 })
  .map((cs) => cs.join(''));

describe('semver-lite properties', () => {
  it.prop([fc.string()])('isStrictSemver never throws on arbitrary input', (s) => {
    expect(typeof isStrictSemver(s)).toBe('boolean');
  });

  it.prop([fc.string()])('isValidConstraint never throws on arbitrary input', (s) => {
    expect(typeof isValidConstraint(s)).toBe('boolean');
  });

  it.prop([fc.string({ unit: 'binary' })])('handles arbitrary code units without throwing', (s) => {
    expect(typeof isStrictSemver(s)).toBe('boolean');
    expect(typeof isValidConstraint(s)).toBe('boolean');
  });

  it.prop([validStrictVersion])('accepts every constructively-valid strict version', (v) => {
    expect(isStrictSemver(v)).toBe(true);
  });

  it.prop([validConstraint], { numRuns: 2000 })(
    'accepts every constructively-valid constraint',
    (c) => {
      expect(isValidConstraint(c)).toBe(true);
    },
  );

  it.prop([validStrictVersion])('a valid strict version is always a valid constraint', (v) => {
    expect(isValidConstraint(v)).toBe(true);
  });

  it.prop([fc.stringMatching(/^[a-z]{3,20}$/)])('rejects pure-alpha as a version', (s) => {
    expect(isStrictSemver(s)).toBe(false);
  });

  it.prop([fourPartVersion])('rejects four-part versions and constraints', (s) => {
    expect(isStrictSemver(s)).toBe(false);
    expect(isValidConstraint(s)).toBe(false);
  });

  it.prop([leadingZeroVersion])('rejects strict versions with a leading-zero segment', (s) => {
    expect(isStrictSemver(s)).toBe(false);
  });

  it.prop([danglingCommaConstraint], { numRuns: 2000 })(
    'rejects a constraint with a dangling comma',
    (s) => {
      expect(isValidConstraint(s)).toBe(false);
    },
  );

  it.prop([semverishString, fc.nat({ max: 512 })], { numRuns: 2000 })(
    'validates in bounded time regardless of structure',
    (base, repeat) => {
      const input = base
        .repeat(Math.max(1, Math.floor(repeat / Math.max(1, base.length))))
        .slice(0, 512);
      const start = performance.now();
      isValidConstraint(input);
      isStrictSemver(input.slice(0, 256));
      expect(performance.now() - start).toBeLessThan(20);
    },
  );

  it.prop([
    fc.constantFrom(' ', '1', 'x', '>', '=', '.', '-', ','),
    fc.integer({ min: 100, max: 512 }),
  ])('no catastrophic backtracking on character floods', (ch, len) => {
    const input = ch.repeat(len);
    const start = performance.now();
    isValidConstraint(input);
    expect(performance.now() - start).toBeLessThan(20);
  });
});
