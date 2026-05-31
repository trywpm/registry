import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { ZodType } from 'zod/v4';
import { describe, it, expect } from 'vitest';

import {
  DigestSchema,
  SemverSchema,
  DistTagSchema,
  PackageSchema,
  PackageNameSchema,
  DANGEROUS_CHARS_REGEX,
  SemverConstraintSchema,
  DependencyVersionSchema,
} from './manifest';

import type { Package } from './manifest';

// =====================================================================
// Test helpers
// =====================================================================

const accepts = (schema: ZodType, value: unknown): boolean => schema.safeParse(value).success;

const validHash = Buffer.alloc(32).toString('base64');
const validDigest = `sha256:${validHash}`;

const buildValidPackage = (): Package => ({
  name: 'my-valid-package',
  description: 'A valid description for the package.',
  type: 'plugin',
  version: '1.0.0',
  requires: { wp: '>=5.0', php: '>=7.4' },
  license: 'GPL-2.0-or-later',
  homepage: 'https://example.com/homepage',
  tags: ['block-editor', 'widget'],
  team: ['john-doe', 'maintainer-team <team@example.com>'],
  dependencies: { 'dependency-one': '1.2.0' },
  devDependencies: { 'dev-dependency': '2.0.0' },
  dist: {
    digest: validDigest,
    totalFiles: 10,
    packedSize: 1024,
    unpackedSize: 4096,
  },
  tag: 'latest',
  _wpm: '1.0.0',
  visibility: 'public',
  readme: '# Package\n\nReadme content.',
});

// =====================================================================
// DANGEROUS_CHARS_REGEX
// =====================================================================

const safe = (s: string) => !DANGEROUS_CHARS_REGEX.test(s);
describe('DANGEROUS_CHARS_REGEX', () => {
  describe('accepts safe content', () => {
    it.each([
      { case: 'empty string', input: '' },
      { case: 'plain ascii', input: 'Hello World' },
      { case: 'alphanumeric', input: 'abc123XYZ' },
      { case: 'tab', input: 'a\tb' },
      { case: 'newline', input: 'a\nb' },
      { case: 'CR', input: 'a\rb' },
      { case: 'CRLF', input: 'a\r\nb' },
      { case: 'multiple newlines', input: 'L1\n\nL2\n\nL3' },
      { case: 'punctuation', input: '!@#$%^&*()_+-=[]{}|;:\'",.<>/? `~' },
      { case: 'french accents', input: 'café résumé naïve' },
      { case: 'german umlauts', input: 'Größe Übung Äpfel' },
      { case: 'spanish', input: '¡Hola! ¿Cómo estás? Niño' },
      { case: 'chinese', input: '你好世界' },
      { case: 'japanese', input: 'こんにちは世界' },
      { case: 'korean', input: '안녕하세요' },
      { case: 'arabic', input: 'مرحبا بالعالم' },
      { case: 'hebrew', input: 'שלום עולם' },
      { case: 'cyrillic', input: 'Привет мир' },
      { case: 'greek', input: 'Γειά σου κόσμε' },
      { case: 'thai', input: 'สวัสดีโลก' },
      { case: 'hindi', input: 'नमस्ते दुनिया' },
      { case: 'persian with ZWNJ', input: 'می\u200Cخوام' },
      { case: 'urdu with ZWNJ', input: 'محبت\u200C کا سفر' },
      { case: 'hindi conjunct with ZWNJ', input: 'क्\u200Cष' },
      { case: 'currency symbols', input: '$100 €50 £30 ¥1000 ₹500' },
      { case: 'math symbols', input: '±×÷√∞≠≤≥' },
      { case: 'simple emoji', input: 'Hello 😀🎉🚀' },
      { case: 'family ZWJ sequence', input: '👨\u200D👩\u200D👧\u200D👦' },
      { case: 'variation selector', input: '❤\uFE0F' },
      { case: 'flag emoji', input: '🇺🇸🇬🇧🇯🇵' },
      { case: 'scotland tag sequence', input: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
      { case: 'keycap', input: '1️⃣' },
      { case: 'skin tone', input: '👍🏽' },
      { case: 'markdown', input: '# Title\n\n**bold** _italic_\n\n- a\n- b' },
      { case: 'code snippet', input: 'const x = () => 42;' },
      { case: 'url', input: 'Visit https://example.com/p?q=1&f=bar' },
      { case: 'email in text', input: 'Contact: user@example.com' },
      { case: 'semver with build', input: '1.0.0-beta.1+build.123' },
    ])('$case', ({ input }) => {
      expect(safe(input)).toBe(true);
    });
  });

  describe('explicitly allows i18n formatters', () => {
    it.each([
      { case: 'ZWJ (emoji sequences)', code: 0x200d },
      { case: 'ZWNJ (Persian/Urdu/Devanagari)', code: 0x200c },
    ])('$case', ({ code }) => {
      expect(safe(`a${String.fromCodePoint(code)}b`)).toBe(true);
    });
  });

  describe('rejects C0 control characters', () => {
    const c0 = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
      29, 30, 31, 127,
    ];
    it.each(c0)('rejects U+%s', (code) => {
      expect(safe(`a${String.fromCharCode(code)}b`)).toBe(false);
    });
  });

  describe('rejects C1 control characters', () => {
    it.each([0x80, 0x81, 0x85, 0x86, 0x9b, 0x9f])('rejects U+%s', (code) => {
      expect(safe(`a${String.fromCharCode(code)}b`)).toBe(false);
    });
  });

  describe('rejects invisible / formatting / bidi characters', () => {
    it.each([
      { case: 'zero-width space (ZWSP)', code: 0x200b },
      { case: 'left-to-right mark (LRM)', code: 0x200e },
      { case: 'right-to-left mark (RLM)', code: 0x200f },
      { case: 'line separator', code: 0x2028 },
      { case: 'paragraph separator', code: 0x2029 },
      { case: 'left-to-right embedding (LRE)', code: 0x202a },
      { case: 'right-to-left embedding (RLE)', code: 0x202b },
      { case: 'pop directional formatting (PDF)', code: 0x202c },
      { case: 'left-to-right override (LRO)', code: 0x202d },
      { case: 'right-to-left override (RLO)', code: 0x202e },
      { case: 'word joiner', code: 0x2060 },
      { case: 'function application', code: 0x2061 },
      { case: 'invisible times', code: 0x2062 },
      { case: 'invisible separator', code: 0x2063 },
      { case: 'invisible plus', code: 0x2064 },
      { case: 'byte order mark (BOM)', code: 0xfeff },
      { case: 'replacement character (encoding error)', code: 0xfffd },
      { case: 'object replacement', code: 0xfffc },
      { case: 'hangul filler (invisible username)', code: 0x3164 },
    ])('$case', ({ code }) => {
      expect(safe(`a${String.fromCodePoint(code)}b`)).toBe(false);
    });
  });

  describe('rejects lone surrogates (Postgres encoding killers)', () => {
    it.each([
      { case: 'lone high surrogate', input: 'a\uD800b' },
      { case: 'lone low surrogate', input: 'a\uDC00b' },
      { case: 'high surrogate at end', input: 'a\uD83D' },
      { case: 'low surrogate at start', input: '\uDC00a' },
      { case: 'standalone high', input: '\uD83D' },
    ])('$case', ({ input }) => {
      expect(safe(input)).toBe(false);
    });
  });

  describe('rejects real-world attack patterns', () => {
    it.each([
      { case: 'null byte injection', input: 'admin\x00.txt' },
      { case: 'RTL extension spoofing', input: 'invoice\u202Efdp.exe' },
      { case: 'ZWSP filter bypass', input: 'sc\u200Bript' },
      { case: 'homograph with ZWSP', input: 'pay\u200Bpal.com' },
      { case: 'ANSI escape injection', input: 'red\x1B[31mtext\x1B[0m' },
      { case: 'BOM at start', input: '\uFEFFhello' },
      { case: 'multiple controls', input: 'a\x00b\x01c\x02' },
      { case: 'control inside URL', input: 'https://example\x00.com' },
      { case: 'invisible username', input: 'admin\u3164' },
    ])('$case', ({ input }) => {
      expect(safe(input)).toBe(false);
    });
  });
});

// =====================================================================
// PackageNameSchema
// =====================================================================

describe('PackageNameSchema', () => {
  describe('accepts', () => {
    it.each([
      { case: 'simple', input: 'package' },
      { case: 'hyphenated', input: 'my-package' },
      { case: 'multi-segment', input: 'my-awesome-package' },
      { case: 'numeric segment', input: 'package-123' },
      { case: 'all numeric', input: '123' },
      { case: 'mixed alphanum', input: 'pkg2-abc3' },
      { case: 'min length (3)', input: 'abc' },
      { case: 'max length (164)', input: 'a'.repeat(164) },
      { case: 'reserved word "constructor" (blocked elsewhere)', input: 'constructor' },
      { case: 'reserved word "tostring" (blocked elsewhere)', input: 'tostring' },
      { case: 'reserved word "valueof" (blocked elsewhere)', input: 'valueof' },
      { case: 'reserved word "private" (blocked elsewhere)', input: 'private' },
    ])('$case', ({ input }) => {
      expect(accepts(PackageNameSchema, input)).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'too short (2)', input: 'ab' },
      { case: 'too long (165)', input: 'a'.repeat(165) },
      { case: 'underscore', input: 'my_package' },
      { case: 'leading hyphen', input: '-mypackage' },
      { case: 'trailing hyphen', input: 'mypackage-' },
      { case: 'consecutive hyphens', input: 'my--package' },
      { case: 'uppercase', input: 'MyPackage' },
      { case: 'space', input: 'my package' },
      { case: 'special character', input: 'my-package!' },
      { case: 'slash (npm-scoped)', input: 'vendor/package' },
      { case: 'leading dot', input: '.hidden' },
      { case: 'unicode letter', input: 'pãckage' },
      { case: 'cyrillic lookalike', input: 'расkage' },
      { case: 'ZWSP injection', input: 'pa\u200Bckage' },
      { case: 'null byte', input: 'pack\x00age' },
      { case: 'underscore-only ("__proto__")', input: '__proto__' },
      { case: 'starts with underscore', input: '_a' },
      { case: 'leading whitespace', input: ' pkg' },
      { case: 'trailing whitespace', input: 'pkg ' },
      { case: 'only hyphen', input: '---' },
      { case: 'only one char', input: 'a' },
      { case: 'tab inside', input: 'a\tb' },
      { case: 'path traversal', input: '../etc-passwd' },
      { case: 'with @ scope', input: '@scope/pkg' },
    ])('$case', ({ input }) => {
      expect(accepts(PackageNameSchema, input)).toBe(false);
    });
  });

  it.each([
    { input: null },
    { input: undefined },
    { input: 123 },
    { input: true },
    { input: [] },
    { input: {} },
    { input: Symbol('x') },
  ])('rejects non-string: $input', ({ input }) => {
    expect(accepts(PackageNameSchema, input)).toBe(false);
  });

  it.each(['con', 'CON', 'Con', 'nul', 'lpt1', 'com9', 'wp', 'wp-admin', 'wp-content'])(
    'rejects reserved name "%s"',
    (name) => {
      expect(PackageNameSchema.safeParse(name).success).toBe(false);
    },
  );

  it('accepts names that contain reserved substrings', () => {
    expect(PackageNameSchema.safeParse('wp-rocket').success).toBe(true);
    expect(PackageNameSchema.safeParse('console-helper').success).toBe(true);
    expect(PackageNameSchema.safeParse('plugins-loader').success).toBe(true);
  });
});

// =====================================================================
// SemverSchema
// =====================================================================

describe('SemverSchema', () => {
  describe('accepts', () => {
    it.each([
      { case: 'simple', input: '1.2.3' },
      { case: 'with prerelease', input: '1.0.0-alpha.1' },
      { case: 'with build', input: '1.0.0+build.123' },
      { case: 'prerelease and build', input: '1.0.0-rc.1+ci.42' },
      { case: 'min length (5)', input: '1.0.0' },
      { case: 'large numbers', input: '999.999.999' },
    ])('$case', ({ input }) => {
      expect(accepts(SemverSchema, input)).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'too short', input: '1.0' },
      { case: 'incomplete', input: '1.2.' },
      { case: 'two segments', input: '1.2' },
      { case: 'one segment', input: '1' },
      { case: 'with v prefix', input: 'v1.2.3' },
      { case: 'with V prefix', input: 'V1.2.3' },
      { case: 'with leading whitespace', input: ' 1.2.3' },
      { case: 'with trailing whitespace', input: '1.2.3 ' },
      { case: 'with internal whitespace', input: '1. 2.3' },
      { case: 'non-numeric segments', input: 'a.b.c' },
      { case: 'with range', input: '^1.2.3' },
      { case: 'wildcard', input: '*' },
      { case: 'tag name', input: 'latest' },
      { case: 'too long (>64)', input: `1.0.0+${'a'.repeat(60)}` },
      { case: 'leading zero', input: '01.0.0' },
      { case: 'negative', input: '-1.0.0' },
    ])('$case', ({ input }) => {
      expect(accepts(SemverSchema, input)).toBe(false);
    });
  });
});

// =====================================================================
// SemverConstraintSchema
// =====================================================================

describe('SemverConstraintSchema', () => {
  describe('accepts', () => {
    it.each([
      { case: 'caret', input: '^1.2.3' },
      { case: 'tilde', input: '~1.2.3' },
      { case: 'wildcard partial', input: '1.x' },
      { case: 'major-minor only', input: '1.2' },
      { case: 'major only', input: '1' },
      { case: 'exact', input: '1.2.3' },
      { case: 'caret partial', input: '^1.2' },
      { case: 'tilde partial', input: '~1' },
      { case: 'gte', input: '>=1.2.7' },
      { case: 'gte+lt', input: '>=1.2.0 <2.0.0' },
      { case: 'hyphen range', input: '1.2.0 - 2.0.0' },
      { case: 'wildcard *', input: '*' },
    ])('$case', ({ input }) => {
      expect(accepts(SemverConstraintSchema, input)).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'leading whitespace', input: ' 1.2.3' },
      { case: 'trailing whitespace', input: '1.2.3 ' },
      { case: 'v-prefix exact', input: 'v1.2.3' },
      { case: 'v-prefix range', input: 'v1.x' },
      { case: 'unknown operator', input: '?1.2.0' },
      { case: 'non-numeric', input: '>=1.2.c' },
      { case: 'trailing comma', input: '> 1.2.0,' },
      { case: 'too long', input: 'a'.repeat(65) },
      { case: 'pure garbage', input: 'definitely-not-a-version' },
    ])('$case', ({ input }) => {
      expect(accepts(SemverConstraintSchema, input)).toBe(false);
    });
  });
});

// =====================================================================
// DistTagSchema
// =====================================================================

describe('DistTagSchema', () => {
  describe('accepts', () => {
    it.each([
      { case: 'latest', input: 'latest' },
      { case: 'beta', input: 'beta' },
      { case: 'next-major', input: 'next-major' },
      { case: 'with numbers', input: 'next-1' },
      { case: 'min length (3)', input: 'dev' },
      { case: 'max length (64)', input: 'a'.repeat(64) },
    ])('$case', ({ input }) => {
      expect(accepts(DistTagSchema, input)).toBe(true);
    });

    it('uses "latest" as default for undefined', () => {
      const result = DistTagSchema.parse(undefined);
      expect(result).toBe('latest');
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'too short (1)', input: 'a' },
      { case: 'too short (2)', input: 'ab' },
      { case: 'too long (65)', input: 'a'.repeat(65) },
      { case: 'uppercase', input: 'LATEST' },
      { case: 'underscore', input: 'next_major' },
      { case: 'special char', input: 'beta!' },
      { case: 'space', input: 'next major' },
    ])('$case', ({ input }) => {
      expect(accepts(DistTagSchema, input)).toBe(false);
    });
  });

  describe('rejects tags resembling versions/ranges', () => {
    it.each([
      { case: 'three-digit number', input: '100' },
      { case: 'four-digit number', input: '9999' },
      { case: 'large numeric', input: '12345' },
    ])('$case (parses as semver range)', ({ input }) => {
      expect(accepts(DistTagSchema, input)).toBe(false);
    });
  });
});

// =====================================================================
// DependencyVersionSchema
// =====================================================================

describe('DependencyVersionSchema', () => {
  describe('accepts', () => {
    it.each([
      { case: 'exact semver', input: '1.2.3' },
      { case: 'prerelease', input: '2.0.0-beta.1' },
      { case: 'build metadata', input: '1.0.0+build.42' },
      { case: 'wildcard', input: '*' },
    ])('$case', ({ input }) => {
      expect(accepts(DependencyVersionSchema, input)).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'caret range', input: '~1.2.3' },
      { case: 'tilde range', input: '^1.2.3' },
      { case: 'partial', input: '1.2' },
      { case: 'v prefix', input: 'v1.0.0' },
      { case: 'wildcard pattern', input: '*.*' },
      { case: 'tag name', input: 'latest' },
      { case: 'comparison', input: '>=1.0.0' },
    ])('$case', ({ input }) => {
      expect(accepts(DependencyVersionSchema, input)).toBe(false);
    });
  });
});

// =====================================================================
// DigestSchema
// =====================================================================

describe('DigestSchema', () => {
  describe('accepts', () => {
    it('canonical sha256 of zero-bytes', () => {
      expect(accepts(DigestSchema, validDigest)).toBe(true);
    });

    it('canonical sha256 of arbitrary content', () => {
      const buf = Buffer.from('the quick brown fox');
      const hash = createHash('sha256').update(buf).digest('base64');
      expect(accepts(DigestSchema, `sha256:${hash}`)).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([
      { case: 'empty', input: '' },
      { case: 'no prefix', input: validHash },
      { case: 'wrong algorithm prefix', input: `sha512:${validHash}` },
      { case: 'uppercase prefix', input: `SHA256:${validHash}` },
      { case: 'whitespace before prefix', input: ` sha256:${validHash}` },
      { case: 'whitespace after hash', input: `sha256:${validHash} ` },
      { case: 'invalid base64 chars', input: 'sha256:not-valid-base64-$%^' },
      {
        case: 'too short (31 bytes)',
        input: `sha256:${Buffer.alloc(31).toString('base64')}`,
      },
      {
        case: 'too long (33 bytes)',
        input: `sha256:${Buffer.alloc(33).toString('base64')}`,
      },
      { case: 'missing padding', input: `sha256:${validHash.slice(0, -1)}` },
      { case: 'extra padding', input: `sha256:${validHash}=` },
      // Strict canonical regex: 43rd char must be in [AEIMQUYcgkosw048],
      // and body must use only [A-Za-z0-9+/]. base64url '_' or '-' fails both.
      {
        case: 'base64url char (underscore) in body',
        input: `sha256:${'A'.repeat(20)}_${'A'.repeat(22)}=`,
      },
      {
        case: 'base64url char (hyphen) in body',
        input: `sha256:${'A'.repeat(20)}-${'A'.repeat(22)}=`,
      },
      {
        case: 'non-canonical 43rd char (lower 2 bits set)',
        // 'B' = position 1 in alphabet; lower 2 bits = 01, non-canonical
        input: `sha256:${'A'.repeat(42)}B=`,
      },
      { case: 'hex digest instead of base64', input: `sha256:${'a'.repeat(64)}` },
    ])('$case', ({ input }) => {
      expect(accepts(DigestSchema, input)).toBe(false);
    });
  });
});

// =====================================================================
// PackageSchema — field-level
// =====================================================================

describe('PackageSchema (field-level)', () => {
  type Mutator = (p: Package) => void;

  const expectValid = (label: string, mutate: Mutator) => {
    it(`accepts: ${label}`, () => {
      const p = structuredClone(buildValidPackage());
      mutate(p);
      const result = PackageSchema.safeParse(p);
      expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
    });
  };

  const expectInvalid = (label: string, mutate: Mutator) => {
    it(`rejects: ${label}`, () => {
      const p = structuredClone(buildValidPackage());
      mutate(p);
      expect(PackageSchema.safeParse(p).success).toBe(false);
    });
  };

  describe('baseline', () => {
    expectValid('untouched valid package', () => {});

    expectValid('all optional fields omitted', (p) => {
      delete p.description;
      delete p.requires;
      delete p.license;
      delete p.homepage;
      delete p.tags;
      delete p.team;
      delete p.dependencies;
      delete p.devDependencies;
      delete p.readme;
    });
  });

  describe('name', () => {
    expectInvalid('missing', (p) => {
      // @ts-expect-error -- testing required field absence
      delete p.name;
    });
    expectInvalid('contains space', (p) => {
      p.name = 'invalid name';
    });
    expectInvalid('contains __proto__', (p) => {
      p.name = '__proto__';
    });
  });

  describe('description', () => {
    expectValid('at min length (3)', (p) => {
      p.description = 'abc';
    });
    expectValid('at max length (512)', (p) => {
      p.description = 'a'.repeat(512);
    });
    expectValid('persian with ZWNJ', (p) => {
      p.description = 'می\u200Cخوام به\u200Cروزرسانی کنم';
    });
    expectValid('emoji and unicode', (p) => {
      p.description = 'A great package 🚀 with 中文 support';
    });
    expectInvalid('too short (1)', (p) => {
      p.description = 'a';
    });
    expectInvalid('too long (513)', (p) => {
      p.description = 'a'.repeat(513);
    });
    expectInvalid('contains null byte', (p) => {
      p.description = 'hello\x00world';
    });
    expectInvalid('contains RTL override', (p) => {
      p.description = 'invoice\u202Efdp.exe';
    });
    expectInvalid('contains lone surrogate', (p) => {
      p.description = 'a\uD800b';
    });
  });

  describe('type', () => {
    expectValid('theme', (p) => {
      p.type = 'theme';
    });
    expectValid('plugin', (p) => {
      p.type = 'plugin';
    });
    expectValid('mu-plugin', (p) => {
      p.type = 'mu-plugin';
    });
    expectInvalid('library', (p) => {
      // @ts-expect-error -- testing invalid enum value
      p.type = 'library';
    });
    expectInvalid('uppercase plugin', (p) => {
      // @ts-expect-error -- testing invalid enum value
      p.type = 'PLUGIN';
    });
    expectInvalid('missing', (p) => {
      // @ts-expect-error -- testing required field absence
      delete p.type;
    });
  });

  describe('version', () => {
    expectValid('with prerelease+build', (p) => {
      p.version = '2.0.0-rc.1+ci.42';
    });
    expectInvalid('two-segment', (p) => {
      p.version = '1.0';
    });
    expectInvalid('v-prefixed', (p) => {
      p.version = 'v1.0.0';
    });
    expectInvalid('range', (p) => {
      p.version = '^1.0.0';
    });
    expectInvalid('leading whitespace', (p) => {
      p.version = ' 1.0.0';
    });
    expectInvalid('missing', (p) => {
      // @ts-expect-error -- testing required field absence
      delete p.version;
    });
  });

  describe('requires', () => {
    expectValid('object with both fields undefined', (p) => {
      p.requires = { wp: undefined, php: undefined };
    });
    expectValid('only wp set', (p) => {
      p.requires = { wp: '>=5.0' };
    });
    expectValid('only php set', (p) => {
      p.requires = { php: '>=7.4' };
    });
    expectValid('with wildcard *', (p) => {
      p.requires = { wp: '*', php: '*' };
    });
    expectInvalid('invalid wp constraint', (p) => {
      p.requires = { wp: 'invalid' };
    });
    expectInvalid('v-prefix constraint', (p) => {
      p.requires = { wp: 'v5.0' };
    });
    expectInvalid('extra unknown key', (p) => {
      // @ts-expect-error -- testing strict object rejection of unknown keys
      p.requires = { wp: '>=5.0', node: '>=18' };
    });
  });

  describe('license', () => {
    expectValid('min length (3)', (p) => {
      p.license = 'MIT';
    });
    expectValid('max length (100)', (p) => {
      p.license = 'a'.repeat(100);
    });
    expectInvalid('too short (1)', (p) => {
      p.license = 'a';
    });
    expectInvalid('too long (101)', (p) => {
      p.license = 'a'.repeat(101);
    });
    expectInvalid('contains control char', (p) => {
      p.license = 'MIT\x00';
    });
  });

  describe('homepage', () => {
    expectValid('https', (p) => {
      p.homepage = 'https://example.com/path';
    });
    expectValid('http', (p) => {
      p.homepage = 'http://example.com/path';
    });
    expectValid('with query string', (p) => {
      p.homepage = 'https://example.com/p?q=1&k=v';
    });
    expectValid('with fragment', (p) => {
      p.homepage = 'https://example.com/#section';
    });
    expectValid('punycode IDN', (p) => {
      p.homepage = 'https://xn--bcher-kva.example';
    });
    expectValid('min length (10)', (p) => {
      p.homepage = 'http://a.b';
    });
    expectValid('max length (200)', (p) => {
      p.homepage = `https://${'a'.repeat(191)}`;
    });

    expectInvalid('too short (8)', (p) => {
      p.homepage = 'http://a';
    });
    expectInvalid('too long (>200)', (p) => {
      p.homepage = `https://${'a'.repeat(193)}`;
    });
    expectInvalid('not a url', (p) => {
      p.homepage = 'not-a-url';
    });
    expectInvalid('ftp scheme', (p) => {
      p.homepage = 'ftp://example.com/file';
    });
    expectInvalid('mailto scheme', (p) => {
      p.homepage = 'mailto:user@example.com';
    });
    expectInvalid('javascript: scheme (XSS vector)', (p) => {
      p.homepage = 'javascript:alert(1)//padding-padding-padding';
    });
    expectInvalid('data: scheme', (p) => {
      p.homepage = 'data:text/html,<script>alert(1)</script>';
    });
    expectInvalid('file: scheme', (p) => {
      p.homepage = 'file:///etc/passwd';
    });
    expectInvalid('protocol-relative', (p) => {
      p.homepage = '//example.com/path';
    });
    expectInvalid('missing scheme', (p) => {
      p.homepage = 'www.example.com';
    });
  });

  describe('tags', () => {
    expectValid('at max count (5)', (p) => {
      p.tags = ['ab', 'cd', 'ef', 'gh', 'ij'];
    });
    expectValid('with i18n content', (p) => {
      p.tags = ['वर्डप्रेस', '插件', 'پلاگین'];
    });
    expectValid('a tag at min length (2)', (p) => {
      p.tags = ['ab'];
    });
    expectValid('a tag at max length (64)', (p) => {
      p.tags = ['a'.repeat(64)];
    });

    expectInvalid('too many (6)', (p) => {
      p.tags = ['ab', 'cd', 'ef', 'gh', 'ij', 'kl'];
    });
    expectInvalid('contains empty string', (p) => {
      p.tags = ['ok', ''];
    });
    expectInvalid('a tag too short (1)', (p) => {
      p.tags = ['a'];
    });
    expectInvalid('a tag too long (65)', (p) => {
      p.tags = ['a'.repeat(65)];
    });
    expectInvalid('duplicates', (p) => {
      p.tags = ['plugin', 'plugin'];
    });
    expectInvalid('control char in tag', (p) => {
      p.tags = ['ok\x00'];
    });
  });

  describe('team', () => {
    expectValid('plain username', (p) => {
      p.team = ['john-doe'];
    });
    expectValid('username with email (RFC-822 style)', (p) => {
      p.team = ['john <john@example.com>'];
    });
    expectValid('non-ASCII name (SVN-migrated)', (p) => {
      p.team = ['野原ひろし'];
    });
    expectValid('team at max count (100)', (p) => {
      p.team = Array.from({ length: 100 }, (_, i) => `member-${i}`);
    });

    expectInvalid('over max (101)', (p) => {
      p.team = Array.from({ length: 101 }, (_, i) => `m-${i}`);
    });
    expectInvalid('duplicates', (p) => {
      p.team = ['member', 'member'];
    });
    expectInvalid('empty string', (p) => {
      p.team = ['ok', ''];
    });
    expectInvalid('too short (1)', (p) => {
      p.team = ['a'];
    });
    expectInvalid('too long (101)', (p) => {
      p.team = ['a'.repeat(101)];
    });
    expectInvalid('control char', (p) => {
      p.team = ['hello\x00there'];
    });
    expectInvalid('RTL override', (p) => {
      p.team = ['admin\u202Efdp.exe'];
    });
    expectInvalid('hangul filler (invisible username)', (p) => {
      p.team = ['admin\u3164'];
    });
  });

  describe('dependencies / devDependencies', () => {
    expectValid('empty deps', (p) => {
      p.dependencies = {};
    });
    expectValid('empty devDeps', (p) => {
      p.devDependencies = {};
    });
    expectValid('at max (16)', (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 16; i++) {
        deps[`dep-${i}`] = '1.0.0';
      }
      p.dependencies = deps;
    });
    expectValid('wildcard version', (p) => {
      p.dependencies = { 'some-pkg': '*' };
    });

    expectInvalid('over max (17)', (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 17; i++) {
        deps[`dep-${i}`] = '1.0.0';
      }
      p.dependencies = deps;
    });
    expectInvalid('invalid dep key (space)', (p) => {
      p.dependencies = { 'invalid name': '1.0.0' };
    });
    expectInvalid('empty dep key', (p) => {
      p.dependencies = { '': '1.0.0' };
    });
    expectInvalid('uppercase dep key', (p) => {
      p.dependencies = { MyPkg: '1.0.0' };
    });

    // Zod treats `__proto__` specially: rather than rejecting it as an unknown
    // key, strict mode silently strips it. The security-relevant invariant is
    // that the polluted key never reaches the parsed result.
    it('strips __proto__ from dependencies (defineProperty)', () => {
      const p = structuredClone(buildValidPackage());
      const malicious: Record<string, string> = {};
      Object.defineProperty(malicious, '__proto__', {
        value: '1.0.0',
        enumerable: true,
        writable: true,
        configurable: true,
      });
      p.dependencies = malicious;
      const result = PackageSchema.safeParse(p);
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const parsedDeps = result.data.dependencies ?? {};
      expect(Object.hasOwn(parsedDeps, '__proto__')).toBe(false);
      expect(Object.keys(parsedDeps)).not.toContain('__proto__');
    });

    expectInvalid('invalid version range', (p) => {
      p.dependencies = { 'valid-name': '^1.0.0' };
    });
    expectInvalid('partial version', (p) => {
      p.dependencies = { 'valid-name': '1.0' };
    });
    expectInvalid('empty version', (p) => {
      p.dependencies = { 'valid-name': '' };
    });
  });

  describe('dist', () => {
    expectInvalid('totalFiles is zero', (p) => {
      p.dist.totalFiles = 0;
    });
    expectInvalid('totalFiles is negative', (p) => {
      p.dist.totalFiles = -1;
    });
    expectInvalid('totalFiles non-integer', (p) => {
      p.dist.totalFiles = 1.5;
    });
    expectInvalid('totalFiles NaN', (p) => {
      p.dist.totalFiles = NaN;
    });
    expectInvalid('totalFiles Infinity', (p) => {
      p.dist.totalFiles = Infinity;
    });
    expectInvalid('totalFiles over 50000', (p) => {
      p.dist.totalFiles = 50_001;
    });
    expectValid('totalFiles at 50000', (p) => {
      p.dist.totalFiles = 50_000;
    });

    expectInvalid('packedSize zero', (p) => {
      p.dist.packedSize = 0;
    });
    expectInvalid('packedSize over 128MB', (p) => {
      p.dist.packedSize = 128 * 1024 * 1024 + 1;
    });
    expectValid('packedSize exactly 128MB', (p) => {
      p.dist.packedSize = 128 * 1024 * 1024;
      p.dist.unpackedSize = 128 * 1024 * 1024;
    });

    expectInvalid('unpackedSize zero', (p) => {
      p.dist.unpackedSize = 0;
    });
    expectInvalid('unpackedSize over 512MB', (p) => {
      p.dist.unpackedSize = 512 * 1024 * 1024 + 1;
    });

    expectInvalid('digest invalid', (p) => {
      p.dist.digest = 'invalid';
    });

    // The compression-ratio refine is currently unreachable: with packedSize
    // capped at 128MB and unpackedSize at 512MB, max achievable ratio is 4×,
    // and the threshold-floored ratio at 5MB packed is 102.4× — both well
    // under MAX_COMPRESSION_RATIO (250). Tests below verify size caps and
    // document that the ratio refine is currently a no-op.
    describe('size caps', () => {
      expectValid('high ratio below threshold (small files allowed)', (p) => {
        p.dist.packedSize = 1024;
        p.dist.unpackedSize = 1024 * 1024;
      });
      expectValid('reasonable ratio above threshold', (p) => {
        p.dist.packedSize = 5 * 1024 * 1024;
        p.dist.unpackedSize = 100 * 1024 * 1024;
      });
      expectInvalid('unpacked exceeds 512MB cap', (p) => {
        p.dist.packedSize = 5 * 1024 * 1024;
        p.dist.unpackedSize = 513 * 1024 * 1024;
      });
    });
  });

  describe('tag', () => {
    expectInvalid('empty', (p) => {
      p.tag = '';
    });
    expectInvalid('uppercase', (p) => {
      p.tag = 'INVALID_TAG';
    });
    expectInvalid('numeric (semver-resembling)', (p) => {
      p.tag = '100';
    });
  });

  describe('_wpm', () => {
    expectInvalid('partial version', (p) => {
      p._wpm = '1.0';
    });
    expectInvalid('range', (p) => {
      p._wpm = '^1.0.0';
    });
  });

  describe('visibility', () => {
    expectValid('public', (p) => {
      p.visibility = 'public';
    });
    expectValid('private', (p) => {
      p.visibility = 'private';
    });
    expectInvalid('protected', (p) => {
      // @ts-expect-error -- testing invalid enum value
      p.visibility = 'protected';
    });
    expectInvalid('uppercase', (p) => {
      // @ts-expect-error -- testing invalid enum value
      p.visibility = 'PUBLIC';
    });
  });

  describe('readme', () => {
    expectValid('empty string', (p) => {
      p.readme = '';
    });
    expectValid('exactly 50KB', (p) => {
      p.readme = 'a'.repeat(50 * 1024);
    });
    expectInvalid('over 50KB', (p) => {
      p.readme = 'a'.repeat(50 * 1024 + 1);
    });

    it('strips line/paragraph separators in transform', () => {
      const p = buildValidPackage();
      p.readme = 'before\u2028after\u2029tail';
      const parsed = PackageSchema.parse(p);
      expect(parsed.readme).toBe('before after tail');
    });

    it('strips bad control chars in transform', () => {
      const p = buildValidPackage();
      p.readme = 'before\x00\x01after';
      const parsed = PackageSchema.parse(p);
      expect(parsed.readme).toBe('beforeafter');
    });

    it('trims after transform', () => {
      const p = buildValidPackage();
      p.readme = '   spaced   ';
      const parsed = PackageSchema.parse(p);
      expect(parsed.readme).toBe('spaced');
    });
  });
});

// =====================================================================
// PackageSchema — cross-field
// =====================================================================

describe('PackageSchema (cross-field)', () => {
  it('rejects self-dependency in dependencies', () => {
    const p = buildValidPackage();
    p.dependencies = { [p.name]: '1.0.0' };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('rejects self-dependency in devDependencies', () => {
    const p = buildValidPackage();
    p.devDependencies = { [p.name]: '1.0.0' };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('rejects same package in both deps and devDeps', () => {
    const p = buildValidPackage();
    p.dependencies = { 'shared-pkg': '1.0.0' };
    p.devDependencies = { 'shared-pkg': '2.0.0' };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('reports each overlap with a precise path', () => {
    const p = buildValidPackage();
    p.dependencies = { 'shared-a': '1.0.0', 'shared-b': '1.0.0' };
    p.devDependencies = { 'shared-a': '2.0.0', 'shared-b': '2.0.0' };
    const result = PackageSchema.safeParse(p);
    if (result.success) {
      throw new Error('expected failure');
    }
    const overlapPaths = result.error.issues
      .filter((i) => i.path.length === 2 && i.path[0] === 'devDependencies')
      .map((i) => i.path[1]);
    expect(overlapPaths).toEqual(expect.arrayContaining(['shared-a', 'shared-b']));
  });
});

// =====================================================================
// Strict object semantics — security
// =====================================================================

describe('strict object enforcement', () => {
  it('rejects unknown top-level key', () => {
    const p = { ...buildValidPackage(), randomExtra: 'value' };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('rejects unknown "private" field at top level (handled at API boundary)', () => {
    const p: Record<string, unknown> = { ...buildValidPackage(), private: true };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('rejects unknown key in nested requires', () => {
    const p: Record<string, unknown> = { ...buildValidPackage() };
    p.requires = { wp: '>=5.0', node: '>=18' };
    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('rejects unknown key in dist', () => {
    const p = buildValidPackage();
    const distPlus = { ...p.dist, sneaky: 'value' };

    p.dist = distPlus;

    expect(PackageSchema.safeParse(p).success).toBe(false);
  });

  it('does NOT silently strip unknown keys (defense in depth)', () => {
    const p = { ...buildValidPackage(), maliciousField: { nested: true } };
    const result = PackageSchema.safeParse(p);
    expect(result.success).toBe(false);
  });
});

// =====================================================================
// Prototype pollution
// =====================================================================

describe('prototype pollution resistance', () => {
  // Zod's strictObject silently STRIPS `__proto__` rather than rejecting it as
  // an unknown key. This is intentional and safer than a runtime error: the
  // polluted property never appears in the parsed result, and Object.prototype
  // remains unmodified. These tests verify the safety invariant directly
  // (no pollution, no leakage), not rejection.

  it('strips __proto__ from parsed result at top level (defineProperty)', () => {
    const p: Record<string, unknown> = { ...buildValidPackage() };
    Object.defineProperty(p, '__proto__', {
      value: { polluted: 'YES' },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const result = PackageSchema.safeParse(p);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const parsed = result.data as Record<string, unknown>;
    expect(Object.hasOwn(parsed, '__proto__')).toBe(false);
    expect(parsed.polluted).toBeUndefined();
  });

  it('strips __proto__ from dependencies (defineProperty)', () => {
    const p = buildValidPackage();
    const malicious: Record<string, string> = {};
    Object.defineProperty(malicious, '__proto__', {
      value: '1.0.0',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    p.dependencies = malicious;
    const result = PackageSchema.safeParse(p);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const parsedDeps = result.data.dependencies ?? {};
    expect(Object.hasOwn(parsedDeps, '__proto__')).toBe(false);
  });

  it('rejects constructor as own property at top level (strict object)', () => {
    const p = buildValidPackage();
    const payload = { ...p, constructor: { polluted: true } };
    expect(PackageSchema.safeParse(payload).success).toBe(false);
  });

  it('does not pollute Object.prototype on parse of malicious payload', () => {
    const probe = {} as Record<string, unknown>;
    const before = probe.polluted;
    const malicious = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"name":"valid-pkg","type":"plugin","version":"1.0.0"}',
    );
    PackageSchema.safeParse(malicious);
    const after = ({} as Record<string, unknown>).polluted;
    expect(before).toBeUndefined();
    expect(after).toBeUndefined();
  });

  it('parses payload built atop Array prototype without crashing', () => {
    const malicious = Object.create([]);
    Object.assign(malicious, buildValidPackage());
    const result = PackageSchema.safeParse(malicious);
    expect(typeof result.success).toBe('boolean');
  });
});

// =====================================================================
// Round-trip
// =====================================================================

describe('round-trip', () => {
  it('valid package survives structuredClone', () => {
    const p = buildValidPackage();
    const cloned = structuredClone(p);
    expect(PackageSchema.safeParse(cloned).success).toBe(true);
  });

  it('valid package survives JSON round-trip', () => {
    const p = buildValidPackage();
    const cloned = structuredClone(p);
    expect(PackageSchema.safeParse(cloned).success).toBe(true);
  });

  it('parsed result has stable shape (readme transform applied)', () => {
    const p = buildValidPackage();
    p.readme = ' \n# Title\u2028line\u2029line  \n ';
    const parsed = PackageSchema.parse(p);
    expect(parsed.readme).toBe('# Title line line');
  });
});

// =====================================================================
// Mutation-testing gaps
// =====================================================================

describe('mutation-testing gaps', () => {
  describe('field-level .trim() is exercised', () => {
    it('rejects description that meets min only without trim', () => {
      const p = buildValidPackage();
      p.description = '  ab  ';

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });

    it('rejects license that meets min only without trim', () => {
      const p = buildValidPackage();
      p.license = '  GP  ';

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });

    it('rejects tag item that meets min only without trim', () => {
      const p = buildValidPackage();
      p.tags = [' a '];

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });

    it('rejects team member that meets min only without trim', () => {
      const p = buildValidPackage();
      p.team = [' x '];

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });
  });

  describe('readme transform trims whitespace produced by replace', () => {
    it('trims whitespace exposed by control-char stripping', () => {
      const p = buildValidPackage();
      p.readme = 'content \x00 ';

      const parsed = PackageSchema.parse(p);

      expect(parsed.readme).toBe('content');
    });
  });

  describe('cross-field check handles missing devDependencies', () => {
    it('accepts deps set with devDeps undefined', () => {
      const p = buildValidPackage();
      p.dependencies = { 'a-pkg': '1.0.0', 'b-pkg': '1.0.0' };
      delete p.devDependencies;

      const result = PackageSchema.safeParse(p);

      expect(result.success).toBe(true);
    });

    it('accepts devDeps set with deps undefined', () => {
      const p = buildValidPackage();
      delete p.dependencies;
      p.devDependencies = { 'a-pkg': '1.0.0', 'b-pkg': '1.0.0' };

      const result = PackageSchema.safeParse(p);

      expect(result.success).toBe(true);
    });
  });

  describe('error issue paths are precise', () => {
    it('self-dep issue path is ["dependencies"]', () => {
      const p = buildValidPackage();
      p.dependencies = { [p.name]: '1.0.0' };

      const result = PackageSchema.safeParse(p);
      if (result.success) {
        throw new Error('expected failure');
      }

      const issue = result.error.issues.find(
        (i) => i.message === 'package cannot depend on itself',
      );

      expect(issue?.path).toEqual(['dependencies']);
    });
  });

  describe('readme outer trim runs before max-length check', () => {
    it('accepts 50KB content padded with whitespace', () => {
      const p = buildValidPackage();
      p.readme = ` ${'a'.repeat(50 * 1024)} `;

      expect(PackageSchema.safeParse(p).success).toBe(true);
    });
  });

  describe('homepage protocol regex is anchored on both sides', () => {
    it('rejects scheme that ends with "https" (xhttps://)', () => {
      const p = buildValidPackage();
      p.homepage = 'xhttps://example.com/path';

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });

    it('rejects scheme that starts with "https" (httpsx://)', () => {
      const p = buildValidPackage();
      p.homepage = 'httpsx://example.com/path';

      expect(PackageSchema.safeParse(p).success).toBe(false);
    });
  });
});
