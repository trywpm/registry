import { describe, it, expect } from 'vitest';

import { isStrictSemver, isValidConstraint, parseConstraintGroups, rewriteRange } from './index';

// version_test.go TestStrictNewVersion: [version, expectError]
const STRICT_VERSION_CASES: Array<[string, boolean]> = [
  ['1.2.3', false],
  ['1.2.3-alpha.01', true],
  ['1.2.3+test.01', false],
  ['1.2.3-alpha.-1', false],
  ['v1.2.3', true],
  ['1.0', true],
  ['v1.0', true],
  ['1', true],
  ['v1', true],
  ['1.2', true],
  ['1.2.beta', true],
  ['v1.2.beta', true],
  ['foo', true],
  ['1.2-5', true],
  ['v1.2-5', true],
  ['1.2-beta.5', true],
  ['v1.2-beta.5', true],
  ['\n1.2', true],
  ['\nv1.2', true],
  ['1.2.0-x.Y.0+metadata', false],
  ['v1.2.0-x.Y.0+metadata', true],
  ['1.2.0-x.Y.0+metadata-width-hypen', false],
  ['v1.2.0-x.Y.0+metadata-width-hypen', true],
  ['1.2.3-rc1-with-hypen', false],
  ['1.2.3-0abc123', false], // string pre-releases can start with 0
  ['1.2.3-beta.01', true], // number segment cannot start with 0
  ['v1.2.3-rc1-with-hypen', true],
  ['1.2.3.4', true],
  ['v1.2.3.4', true],
  ['1.2.2147483648', false],
  ['1.2147483648.3', false],
  ['2147483648.3.0', false],
  // Lack of all 3 parts should produce an error.
  ['20221209-update-renovatejson-v4', true],
  // Various cases that are invalid semver
  ['1.1.2+.123', true], // leading . in build metadata
  ['1.0.0-alpha_beta', true], // underscore in pre-release
  ['1.0.0-alpha..', true], // multiple empty segments
  ['1.0.0-alpha..1', true],
  ['01.1.1', true], // leading 0 on a number segment
  ['1.01.1', true],
  ['1.1.01', true],
  ['9.8.7+meta+meta', true], // multiple metadata parts
  ['1.2.31----RC-SNAPSHOT.12.09.1--.12+788', true], // leading 0 in numeric pre-release segment
  ['1.2.3-0123', true],
  ['1.2.3-0123.0123', true],
  ['+invalid', true],
  ['-invalid', true],
  ['-invalid.01', true],
  ['alpha+beta', true],
  ['1.2.3-alpha_beta+foo', true],
];

// constraints_test.go TestNewConstraint: [input, orGroups, firstGroupCount, expectError]
const NEW_CONSTRAINT_CASES: Array<[string, number, number, boolean]> = [
  ['>= 1.1', 1, 1, false],
  ['>40.50.60, < 50.70', 1, 2, false],
  ['2.0', 1, 1, false],
  ['v2.3.5-20161202202307-sha.e8fc5e5', 1, 1, false],
  ['v1.2.3-0abc', 1, 1, false],
  ['v1.2.3-beta.01', 1, 1, true],
  ['>= bar', 0, 0, true],
  ['BAR >= 1.2.3', 0, 0, true],
  // space separated AND
  ['>= 1.2.3 < 2.0', 1, 2, false],
  ['>= 1.2.3 < 2.0 || => 3.0 < 4', 2, 2, false],
  // commas separating AND
  ['>= 1.2.3, < 2.0', 1, 2, false],
  ['>= 1.2.3, < 2.0 || => 3.0, < 4', 2, 2, false],
  // the 3 - 4 is broken into 2 by range rewriting
  ['3 - 4 || => 3.0, < 4', 2, 2, false],
  // 4-part versions error (Masterminds#185)
  ['12.3.4.1234', 0, 0, true],
  ['12.23.4.1234', 0, 0, true],
  ['12.3.34.1234', 0, 0, true],
  ['12.3.34 ~1.2.3', 1, 2, false],
  ['12.3.34~ 1.2.3', 0, 0, true],
  ['1.0.0 - 2.0.0, <=2.0.0', 1, 3, false],
];

// constraints_test.go TestRewriteRange: [input, rewritten]
const REWRITE_RANGE_CASES: Array<[string, string]> = [
  ['2 - 3', '>= 2, <= 3 '],
  ['2 - 3, 2 - 3', '>= 2, <= 3 ,>= 2, <= 3 '],
  ['2 - 3, 4.0.0 - 5.1', '>= 2, <= 3 ,>= 4.0.0, <= 5.1 '],
  ['2 - 3 4.0.0 - 5.1', '>= 2, <= 3 >= 4.0.0, <= 5.1 '],
  ['1.0.0 - 2.0.0 <=2.0.0', '>= 1.0.0, <= 2.0.0 <=2.0.0'],
];

// Every constraint string exercised by TestConstraintCheck, TestConstraintsCheck,
// TestConstraintsValidate and the IncludePrerelease variants where all must parse.
const MUST_PARSE_CONSTRAINTS: string[] = [
  '!=4.1',
  '!=4.1-alpha',
  '!=4.1.0',
  '!=4.1.x',
  '!=4.2.x',
  '!=4.x',
  '*',
  '*-0',
  '0.0.0',
  '0.0.x',
  '0.x.x',
  '1.0.0 - 2.0.0 <=2.0.0',
  '1.0.0 - 2.0.0, <=2.0.0',
  '1.1 - 2',
  '1.1-3',
  '1.2',
  '1.5.0 - 4.5',
  '1.x',
  '2',
  '2.*',
  '2.1',
  '2.1.*',
  '2.x,   >=1.2.3 || >4.5.6, < 5.7',
  '2.x,   >=1.2.3 || >4.5.6, < 5.7 || >40.50.60, < 50.70',
  '4.1',
  '4.1.x',
  '<0',
  '<0-z',
  '<1.1',
  '<1.1.x',
  '<1.2.x',
  '<1.x',
  '<11',
  '<2.x',
  '<=1.1',
  '<=1.1-a',
  '<=1.1.x',
  '<=1.x',
  '<=11',
  '<=2.x',
  '<=4.5',
  '= 2.0',
  '=0',
  '=2.0',
  '=2.0.0',
  '>   1.1, <2',
  '> 1.1    <3',
  '> 1.1 < 2',
  '> 1.1, <     2',
  '>0',
  '>0-0',
  '>0.0',
  '>0.0-0',
  '>0.0.0-0',
  '>1.1',
  '>1.1    <3',
  '>1.1 < 2',
  '>1.1 <2',
  '>1.1, <  3',
  '>1.1, <2',
  '>1.1, <3',
  '>1.2.3-alpha.1',
  '>11',
  '>11.1',
  '>= 1.0.0  <= 2.0.0-beta',
  '>= 1.0.0  <= 2.0.0-beta != 1.0.1 || > 3',
  '>= 1.0.0  <= 2.0.0-beta != 1.0.1-beta || > 3',
  '>= 1.0.0  <= 2.0.0-beta || > 3',
  '>= 1.0.0-0  <= 2.0.0',
  '>= 1.1 < 2 !=1.2.3 || > 3',
  '>= 1.1 <2 != 1.2.3',
  '>= 1.1 <2 != 1.2.3 || > 3',
  '>= 1.1 <2 != 1.2.3 || >= 3',
  '>= 1.1, <     2, !=1.2.3',
  '>= 1.1, <2, != 1.2.3 || > 3',
  '>= 1.1, <2, != 1.2.3 || >= 3',
  '>= 1.1, <2, !=1.2.3 || > 3',
  '>= 1.2.3',
  '>=0',
  '>=0-0',
  '>=0.0',
  '>=0.0-0',
  '>=0.0.0-0',
  '>=1.1',
  '>=1.1    < 2    != 1.2.3',
  '>=1.1    <2    !=1.2.3',
  '>=1.1 < 2 !=1.2.3 || > 3',
  '>=1.1 <2 !=1.2.3',
  '>=1.1 <2 !=1.2.3 || > 3',
  '>=1.1 <2 !=1.2.3 || >= 3',
  '>=1.1, <2, !=1.2.3',
  '>=1.1, <2, !=1.2.3 || > 3',
  '>=1.1, <2, !=1.2.3 || >= 3',
  '>=1.2.3',
  '>=11',
  '>=11.1',
  '^0',
  '^0.0',
  '^0.0.0',
  '^0.0.1',
  '^0.0.3',
  '^0.2',
  '^0.2.3',
  '^0.2.3-beta.2',
  '^1',
  '^1.1',
  '^1.1.0',
  '^1.1.1-alpha',
  '^1.1.1-beta',
  '^1.1.2-alpha',
  '^1.2',
  '^1.2.0',
  '^1.2.0-alpha.0',
  '^1.2.0-alpha.2',
  '^1.2.3',
  '^1.2.x-alpha',
  '^1.x',
  '^2.x',
  '~*',
  '~0.0.0',
  '~0.2.3',
  '~1',
  '~1.1',
  '~1.1-alpha',
  '~1.1.1-beta',
  '~1.2',
  '~1.2.3',
  '~1.2.3-beta.2',
  '~1.3',
  '~1.3.5-alpha',
  '~1.3.5-beta',
  '~1.3.6-alpha',
  '~1.x',
];

describe('isStrictSemver (Masterminds StrictNewVersion)', () => {
  it.each(STRICT_VERSION_CASES)('%j -> error: %s', (version, expectError) => {
    expect(isStrictSemver(version)).toBe(!expectError);
  });

  it('rejects the empty string and oversized input', () => {
    expect(isStrictSemver('')).toBe(false);
    expect(isStrictSemver(`1.2.3-${'a'.repeat(256)}`)).toBe(false);
  });

  it('accepts numbers up to uint64 max and rejects beyond', () => {
    expect(isStrictSemver('18446744073709551615.0.0')).toBe(true);
    expect(isStrictSemver('18446744073709551616.0.0')).toBe(false);
    expect(isStrictSemver('99999999999999999999999.0.0')).toBe(false);
  });
});

describe('isValidConstraint (Masterminds NewConstraint)', () => {
  it.each(NEW_CONSTRAINT_CASES)('%j -> error: %s', (input, ors, count, expectError) => {
    const groups = parseConstraintGroups(input);
    if (expectError) {
      expect(groups).toBeNull();
    } else {
      expect(groups).not.toBeNull();
      expect(groups).toHaveLength(ors);
      expect(groups![0]).toBe(count);
    }
  });

  it.each(MUST_PARSE_CONSTRAINTS.map((c) => [c]))('parses %j', (c) => {
    expect(isValidConstraint(c)).toBe(true);
  });

  it('rejects the empty constraint and enforces limits', () => {
    expect(isValidConstraint('')).toBe(false);
    expect(isValidConstraint('a'.repeat(513))).toBe(false);
    expect(isValidConstraint(Array(33).fill('1.2.3').join(' || '))).toBe(false);
    expect(isValidConstraint(Array(32).fill('1.2.3').join(' || '))).toBe(true);
  });
});

describe('rewriteRange (Masterminds rewriteRange)', () => {
  it.each(REWRITE_RANGE_CASES)('%j -> %j', (input, expected) => {
    expect(rewriteRange(input)).toBe(expected);
  });
});
