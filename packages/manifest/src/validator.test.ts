import { describe, expect } from 'vitest';
import { fc, it } from '@fast-check/vitest';

import { isValidPackageName, isValidTagName, isValidSemver } from './validator';

describe('isValidPackageName', () => {
  it.each(['abc', 'my-package', '123-abc', 'a-b-c', '123456', 'a'.repeat(3), 'a'.repeat(164)])(
    'returns true for valid package name: "%s"',
    (val) => {
      expect(isValidPackageName(val)).toBe(true);
    },
  );

  it.each([
    'ab',
    'a'.repeat(165),
    '-abc',
    'abc-',
    'ab--cd',
    'my_package',
    'My-Package',
    'my package',
    'my.package',
    '',
  ])('returns false for invalid package name: "%s"', (val) => {
    expect(isValidPackageName(val)).toBe(false);
  });
});

describe('isValidTagName', () => {
  it.each(['abc', 'tag-name-123', 'a'.repeat(64)])(
    'returns true for valid tag name: "%s"',
    (val) => {
      expect(isValidTagName(val)).toBe(true);
    },
  );

  it.each(['ab', 'a'.repeat(65), '-tag', 'tag-', 'Tag-Name'])(
    'returns false for invalid tag name: "%s"',
    (val) => {
      expect(isValidTagName(val)).toBe(false);
    },
  );
});

describe('isValidSemver', () => {
  it.each([
    '1.0.0',
    '0.0.0',
    '12.34.567',
    '01.02.03',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0+build.123',
    '1.2.3-rc.1+build.1',
    '1.2.3-',
    '1.2.3+',
    '1.0.0-0.3.7',
  ])('returns true for valid loose semver: "%s"', (val) => {
    expect(isValidSemver(val)).toBe(true);
  });

  it.each([
    '1.2',
    '1.2.',
    '.1.2',
    'a.1.2',
    '1.b.2',
    '1.2.c',
    '1..2',
    '1.2.3_alpha',
    '1.2.3-@#$',
    '1.2.3+alpha!',
    '1.0.0 ',
    ' 1.0.0',
    '1.0.0.0',
    '1',
    '1.2.3'.padEnd(65, '-'),
  ])('returns false for invalid semver: "%s"', (val) => {
    expect(isValidSemver(val)).toBe(false);
  });
});

// ====== FUZZ TESTS =====

const oracles = {
  tagName: (s: string) => s.length >= 3 && s.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s),
  semver: (s: string) =>
    s.length >= 5 && s.length <= 64 && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.\-+]*)?$/.test(s),
  packageName: (s: string) =>
    s.length >= 3 && s.length <= 164 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s),
};

const printableChar = fc.integer({ min: 32, max: 126 }).map((c) => String.fromCharCode(c));

const mutated = (seed: string) =>
  fc
    .tuple(fc.nat({ max: seed.length - 1 }), printableChar)
    .map(([idx, ch]) => seed.slice(0, idx) + ch + seed.slice(idx + 1));

const randomPrintable = (maxLen: number) =>
  fc.array(printableChar, { minLength: 0, maxLength: maxLen }).map((cs) => cs.join(''));

const candidate = (seed: string, maxLen: number) =>
  fc.oneof(randomPrintable(maxLen), mutated(seed));

const semverCandidate = candidate('1.23.456-alpha.1+build.789', 100);
const tagNameCandidate = candidate('valid-tag-123', 100);
const packageNameCandidate = candidate('valid-package-123', 200);

describe('fuzz tests', () => {
  it.prop([packageNameCandidate], { numRuns: 500 })(
    'isValidPackageName matches regex oracle',
    (s) => {
      expect(isValidPackageName(s)).toBe(oracles.packageName(s));
    },
  );

  it.prop([semverCandidate], { numRuns: 500 })('isValidSemver matches regex oracle', (s) => {
    expect(isValidSemver(s)).toBe(oracles.semver(s));
  });

  it.prop([tagNameCandidate], { numRuns: 500 })('isValidTagName matches regex oracle', (s) => {
    expect(isValidTagName(s)).toBe(oracles.tagName(s));
  });
});
