import { describe, it, expect } from 'vitest';
import { isValidPackageName, isValidTagName, isValidSemver } from './validation';

const generateRandomString = (maxLength: number) => {
  const length = Math.floor(Math.random() * maxLength);
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(Math.floor(Math.random() * 95) + 32);
  }
  return str;
};

const mutateString = (str: string) => {
  if (!str) {
    return str;
  }
  const index = Math.floor(Math.random() * str.length);
  const newChar = String.fromCharCode(Math.floor(Math.random() * 95) + 32);
  return str.slice(0, index) + newChar + str.slice(index + 1);
};

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

describe('Fuzz Testing', () => {
  const oracles = {
    packageName: (s: string) =>
      s.length >= 3 && s.length <= 164 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s),
    tagName: (s: string) => s.length >= 3 && s.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s),
    semver: (s: string) =>
      s.length >= 5 && s.length <= 64 && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.\-+]*)?$/.test(s),
  };

  const ITERATIONS = 10_000;

  it(`isValidPackageName matches Regex Oracle over ${ITERATIONS} iterations`, () => {
    const baseValidStr = 'valid-package-123';
    for (let i = 0; i < ITERATIONS; i++) {
      const testStr = Math.random() > 0.5 ? generateRandomString(200) : mutateString(baseValidStr);
      expect(isValidPackageName(testStr)).toBe(oracles.packageName(testStr));
    }
  });

  it(`isValidTagName matches Regex Oracle over ${ITERATIONS} iterations`, () => {
    const baseValidStr = 'valid-tag-123';
    for (let i = 0; i < ITERATIONS; i++) {
      const testStr = Math.random() > 0.5 ? generateRandomString(100) : mutateString(baseValidStr);
      expect(isValidTagName(testStr)).toBe(oracles.tagName(testStr));
    }
  });

  it(`isValidSemver matches Regex Oracle over ${ITERATIONS} iterations`, () => {
    const baseValidStr = '1.23.456-alpha.1+build.789';
    for (let i = 0; i < ITERATIONS; i++) {
      const testStr = Math.random() > 0.5 ? generateRandomString(100) : mutateString(baseValidStr);
      expect(isValidSemver(testStr)).toBe(oracles.semver(testStr));
    }
  });
});
