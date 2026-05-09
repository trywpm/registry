import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';

import type { ZodType } from 'zod/v4';

import {
  DigestSchema,
  SemverSchema,
  DistTagSchema,
  PackageSchema,
  PackageNameSchema,
  DANGEROUS_CHARS_REGEX,
  SemverConstraintSchema,
  DependencyVersionSchema,
} from './package';

import type { Package } from './package';

const validateVar = (schema: ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? null : result.error;
};

describe('ValidateStringsForControlChars', () => {
  const isValidString = (input: string): boolean => {
    return !DANGEROUS_CHARS_REGEX.test(input);
  };

  const cases = [
    // ============================================
    // Valid strings ✅
    // ============================================

    // Basic text
    { name: 'valid plain ascii text', input: 'Hello World', isValid: true },
    { name: 'valid alphanumeric', input: 'abc123XYZ', isValid: true },
    { name: 'valid empty string', input: '', isValid: true },

    // Allowed whitespace
    { name: 'valid with tab', input: 'Hello\tWorld', isValid: true },
    { name: 'valid with newline', input: 'Hello\nWorld', isValid: true },
    { name: 'valid with carriage return', input: 'Hello\rWorld', isValid: true },
    { name: 'valid with CRLF', input: 'Hello\r\nWorld', isValid: true },
    { name: 'valid with multiple newlines', input: 'Line1\n\nLine2\n\nLine3', isValid: true },

    // Punctuation and symbols
    { name: 'valid with common punctuation', input: 'Hello, World!  How are you?', isValid: true },
    {
      name: 'valid with special symbols',
      input: '!@#$%^&*()_+-=[]{}|;:\'",.<>/? `~',
      isValid: true,
    },
    { name: 'valid with brackets', input: '[test] {data} (info) <tag>', isValid: true },

    // International characters
    { name: 'valid with accented characters', input: 'café résumé naïve', isValid: true },
    { name: 'valid with german umlauts', input: 'Größe Übung Äpfel', isValid: true },
    { name: 'valid with french text', input: "C'est très bien, merci beaucoup!", isValid: true },
    { name: 'valid with spanish text', input: '¡Hola!  ¿Cómo estás?  Niño', isValid: true },
    { name: 'valid with chinese characters', input: '你好世界', isValid: true },
    { name: 'valid with japanese characters', input: 'こんにちは世界', isValid: true },
    { name: 'valid with korean characters', input: '안녕하세요', isValid: true },
    { name: 'valid with arabic text', input: 'مرحبا بالعالم', isValid: true },
    { name: 'valid with hebrew text', input: 'שלום עולם', isValid: true },
    { name: 'valid with russian cyrillic', input: 'Привет мир', isValid: true },
    { name: 'valid with greek text', input: 'Γειά σου κόσμε', isValid: true },
    { name: 'valid with thai text', input: 'สวัสดีโลก', isValid: true },
    { name: 'valid with hindi text', input: 'नमस्ते दुनिया', isValid: true },

    // Currency and math
    { name: 'valid with currency symbols', input: 'Price: $100 €50 £30 ¥1000 ₹500', isValid: true },
    { name: 'valid with math symbols', input: '±×÷√∞≠≤≥', isValid: true },

    // Emoji
    { name: 'valid with emoji', input: 'Hello 😀🎉🚀', isValid: true },
    { name: 'valid with complex emoji', input: '👨‍👩‍👧‍👦 Family', isValid: true },
    { name: 'valid emoji with variation selector', input: '❤\uFE0F', isValid: true },
    { name: 'valid with flag emoji', input: '🇺🇸🇬🇧🇯🇵', isValid: true },
    { name: 'valid flag with tag sequence (Scotland)', input: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', isValid: true },
    { name: 'valid keycap sequence', input: '1️⃣', isValid: true },
    { name: 'valid skin tone', input: '👍🏽', isValid: true },

    // Real-world use cases
    {
      name: 'valid package description',
      input: 'A fast, lightweight HTTP client for Node.js',
      isValid: true,
    },
    { name: 'valid license text', input: 'MIT OR Apache-2.0', isValid: true },
    {
      name: 'valid readme content',
      input: '# My Package\n\nThis is a **great** package!\n\n## Features\n\n- Fast\n- Simple',
      isValid: true,
    },
    { name: 'valid code snippet', input: 'const x = () => { return 42; };', isValid: true },
    {
      name: 'valid url in text',
      input: 'Visit https://example.com/path? query=1&foo=bar',
      isValid: true,
    },
    { name: 'valid email in text', input: 'Contact: user@example.com', isValid: true },
    { name: 'valid semver', input: '1.0.0-beta.1+build.123', isValid: true },

    // ============================================
    // Invalid strings - C0 control characters ❌
    // ============================================

    { name: 'invalid with null byte', input: 'Hello\x00World', isValid: false },
    { name: 'invalid with SOH', input: 'Hello\x01World', isValid: false },
    { name: 'invalid with STX', input: 'Hello\x02World', isValid: false },
    { name: 'invalid with ETX', input: 'Hello\x03World', isValid: false },
    { name: 'invalid with EOT', input: 'Hello\x04World', isValid: false },
    { name: 'invalid with ENQ', input: 'Hello\x05World', isValid: false },
    { name: 'invalid with ACK', input: 'Hello\x06World', isValid: false },
    { name: 'invalid with BEL', input: 'Hello\x07World', isValid: false },
    { name: 'invalid with backspace', input: 'Hello\x08World', isValid: false },
    { name: 'invalid with vertical tab', input: 'Hello\x0BWorld', isValid: false },
    { name: 'invalid with form feed', input: 'Hello\x0CWorld', isValid: false },
    { name: 'invalid with SO', input: 'Hello\x0EWorld', isValid: false },
    { name: 'invalid with SI', input: 'Hello\x0FWorld', isValid: false },
    { name: 'invalid with DLE', input: 'Hello\x10World', isValid: false },
    { name: 'invalid with DC1', input: 'Hello\x11World', isValid: false },
    { name: 'invalid with DC2', input: 'Hello\x12World', isValid: false },
    { name: 'invalid with DC3', input: 'Hello\x13World', isValid: false },
    { name: 'invalid with DC4', input: 'Hello\x14World', isValid: false },
    { name: 'invalid with NAK', input: 'Hello\x15World', isValid: false },
    { name: 'invalid with SYN', input: 'Hello\x16World', isValid: false },
    { name: 'invalid with ETB', input: 'Hello\x17World', isValid: false },
    { name: 'invalid with CAN', input: 'Hello\x18World', isValid: false },
    { name: 'invalid with EM', input: 'Hello\x19World', isValid: false },
    { name: 'invalid with SUB', input: 'Hello\x1AWorld', isValid: false },
    { name: 'invalid with ESC', input: 'Hello\x1BWorld', isValid: false },
    { name: 'invalid with FS', input: 'Hello\x1CWorld', isValid: false },
    { name: 'invalid with GS', input: 'Hello\x1DWorld', isValid: false },
    { name: 'invalid with RS', input: 'Hello\x1EWorld', isValid: false },
    { name: 'invalid with US', input: 'Hello\x1FWorld', isValid: false },
    { name: 'invalid with DEL', input: 'Hello\x7FWorld', isValid: false },

    // ============================================
    // Invalid strings - C1 control characters ❌
    // ============================================

    { name: 'invalid with C1 PAD', input: 'Hello\x80World', isValid: false },
    { name: 'invalid with C1 HOP', input: 'Hello\x81World', isValid: false },
    { name: 'invalid with C1 NEL', input: 'Hello\x85World', isValid: false },
    { name: 'invalid with C1 SSA', input: 'Hello\x86World', isValid: false },
    { name: 'invalid with C1 CSI', input: 'Hello\x9BWorld', isValid: false },
    { name: 'invalid with C1 end range', input: 'Hello\x9FWorld', isValid: false },

    // ============================================
    // Invalid strings - Zero-width characters ❌
    // ============================================

    { name: 'invalid with zero-width space', input: 'Hello\u200BWorld', isValid: false },
    { name: 'invalid with zero-width non-joiner', input: 'Hello\u200CWorld', isValid: false },
    { name: 'invalid with left-to-right mark', input: 'Hello\u200EWorld', isValid: false },
    { name: 'invalid with right-to-left mark', input: 'Hello\u200FWorld', isValid: false },

    // ============================================
    // Invalid strings - Line/paragraph separators ❌
    // ============================================

    { name: 'invalid with line separator', input: 'Hello\u2028World', isValid: false },
    { name: 'invalid with paragraph separator', input: 'Hello\u2029World', isValid: false },

    // ============================================
    // Invalid strings - Bidirectional overrides ❌
    // ============================================

    { name: 'invalid with LRE', input: 'Hello\u202AWorld', isValid: false },
    { name: 'invalid with RLE', input: 'Hello\u202BWorld', isValid: false },
    { name: 'invalid with PDF', input: 'Hello\u202CWorld', isValid: false },
    { name: 'invalid with LRO', input: 'Hello\u202DWorld', isValid: false },
    { name: 'invalid with RLO', input: 'Hello\u202EWorld', isValid: false },

    // ============================================
    // Invalid strings - Invisible formatters ❌
    // ============================================

    { name: 'invalid with word joiner', input: 'Hello\u2060World', isValid: false },
    { name: 'invalid with function application', input: 'Hello\u2061World', isValid: false },
    { name: 'invalid with invisible times', input: 'Hello\u2062World', isValid: false },
    { name: 'invalid with invisible separator', input: 'Hello\u2063World', isValid: false },
    { name: 'invalid with invisible plus', input: 'Hello\u2064World', isValid: false },

    // ============================================
    // Invalid strings - BOM and specials ❌
    // ============================================

    { name: 'invalid with BOM', input: 'Hello\uFEFFWorld', isValid: false },
    { name: 'invalid with BOM at start', input: '\uFEFFHello World', isValid: false },
    { name: 'invalid with replacement char', input: 'Hello\uFFFDWorld', isValid: false },
    { name: 'invalid with object replacement', input: 'Hello\uFFFCWorld', isValid: false },
    { name: 'invalid with specials block', input: 'Hello\uFFF0World', isValid: false },
    { name: 'invalid with noncharacter', input: 'Hello\uFFFFWorld', isValid: false },

    // ============================================
    // Invalid strings - Surrogate pairs (lone) ❌
    // ============================================

    { name: 'invalid with lone high surrogate', input: 'Hello\uD800World', isValid: false },
    { name: 'invalid with lone low surrogate', input: 'Hello\uDC00World', isValid: false },
    { name: 'invalid with surrogate at end', input: 'Hello\uD83D', isValid: false },
    { name: 'invalid lone surrogate (postgres killer)', input: '\uD83D', isValid: false },
    { name: 'invalid postgres null byte', input: 'user\u0000name', isValid: false },

    // ============================================
    // Invalid strings - Hidden in content ❌
    // ============================================

    { name: 'invalid null byte at start', input: '\x00Hello World', isValid: false },
    { name: 'invalid null byte at end', input: 'Hello World\x00', isValid: false },
    { name: 'invalid control char in url', input: 'https://example\x00.com', isValid: false },
    { name: 'invalid zero-width in email', input: 'user\u200B@example.com', isValid: false },
    { name: 'invalid bidi override in path', input: 'docs/\u202Efile.txt', isValid: false },
    { name: 'invalid multiple control chars', input: 'He\x00ll\x01o\x02', isValid: false },

    // ============================================
    // Real attack patterns ❌
    // ============================================

    { name: 'invalid null byte injection', input: 'admin\x00.txt', isValid: false },
    { name: 'invalid RTL override spoofing', input: 'invoice\u202Efdp.exe', isValid: false },
    { name: 'invalid zero-width filter bypass', input: 'sc\u200Bript', isValid: false },
    { name: 'invalid homograph with zero-width', input: 'pay\u200Bpal. com', isValid: false },
    { name: 'invalid escape sequence injection', input: 'Hello\x1B[31mRed\x1B[0m', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = isValidString(c.input);
      expect(result).toBe(c.isValid);
    });
  }
});

describe('NewWpmJsonValidator (Field Level)', () => {
  test('wpm_name validator', () => {
    expect(validateVar(PackageNameSchema, 'my-package')).toBeNull();
    expect(validateVar(PackageNameSchema, 'not_a_valid_name')).not.toBeNull();
  });

  test('wpm_semver validator', () => {
    expect(validateVar(SemverSchema, '1.0.0')).toBeNull();
    expect(validateVar(SemverSchema, 'invalid_version')).not.toBeNull();
  });

  test('wpm_dist_tag validator', () => {
    expect(validateVar(DistTagSchema, 'latest')).toBeNull();
    expect(validateVar(DistTagSchema, 'INVALID_TAG')).not.toBeNull();
  });

  test('wpm_digest_sha256 validator', () => {
    const validBase64 = Buffer.alloc(32).toString('base64');
    expect(validateVar(DigestSchema, `sha256:${validBase64}`)).toBeNull();
    expect(validateVar(DigestSchema, 'sha256:invalid_base64$$$')).not.toBeNull();
  });

  test('wpm_http_url validator', () => {
    expect(validateVar(PackageSchema.shape.homepage, 'https://example.com/resource')).toBeNull();
    expect(validateVar(PackageSchema.shape.homepage, 'ftp://example.com/resource')).not.toBeNull();
  });

  test('wpm_semver_constraint validator', () => {
    expect(validateVar(SemverConstraintSchema, '^1.2.3')).toBeNull();
    expect(validateVar(SemverConstraintSchema, 'invalid-constraint')).not.toBeNull();
  });

  test('wpm_dependency_version validator', () => {
    expect(validateVar(DependencyVersionSchema, '1.2.3')).toBeNull();
    expect(validateVar(DependencyVersionSchema, '*')).toBeNull();
    expect(validateVar(DependencyVersionSchema, 'invalid_version')).not.toBeNull();
  });
});

const getValidPackage = (): Package => {
  const validDigest = `sha256:${Buffer.alloc(32).toString('base64')}`;
  return {
    name: 'my-valid-package',
    description: 'A valid description.',
    type: 'plugin',
    version: '1.0.0',
    requires: {
      wp: '>=5.0',
      php: '>=7.4',
    },
    license: 'GPL-2.0-or-later',
    homepage: 'https://example.com/homepage',
    tags: ['block-editor', 'widget'],
    team: ['John Doe <john.doe@example.com>'],
    dependencies: {
      'dependency-one': '1.2.0',
    },
    devDependencies: {
      'dev-dependency': '2.0.0',
    },
    dist: {
      totalFiles: 10,
      packedSize: 1024,
      unpackedSize: 4096,
      digest: validDigest,
    },
    tag: 'latest',
    _wpm: '1.0.0',
    visibility: 'public',
    readme: '# My Valid Package\n\nThis is the README for my valid package.',
  };
};

describe('PackageValidation', () => {
  type Modifier = (p: Package) => void;

  const runTest = (name: string, modifier: Modifier, expectErr: boolean) => {
    test(name, () => {
      const p = structuredClone(getValidPackage());
      modifier(p);
      const result = PackageSchema.safeParse(p);
      if (expectErr) {
        expect(result.success).toBe(false);
      } else {
        expect(result.success).toBe(true);
      }
    });
  };

  runTest('valid package', () => {}, false);

  runTest(
    'valid package with all optional fields omitted',
    (p) => {
      delete p.description;
      delete p.requires;
      delete p.license;
      delete p.homepage;
      delete p.tags;
      delete p.team;
      delete p.dependencies;
      delete p.devDependencies;
    },
    false,
  );

  runTest(
    'missing required config name',
    (p) => {
      // @ts-expect-error -- testing missing required field
      delete p.name;
    },
    true,
  );

  runTest(
    'invalid config name',
    (p) => {
      p.name = 'invalid name';
    },
    true,
  );

  runTest(
    'description too short',
    (p) => {
      p.description = 'a';
    },
    true,
  );

  runTest(
    'description min length',
    (p) => {
      p.description = 'abc';
    },
    false,
  );

  runTest(
    'description max length',
    (p) => {
      p.description = 'a'.repeat(512);
    },
    false,
  );

  runTest(
    'description too long',
    (p) => {
      p.description = 'a'.repeat(513);
    },
    true,
  );

  runTest(
    'invalid package type',
    (p) => {
      // @ts-expect-error -- testing invalid package type
      p.type = 'library';
    },
    true,
  );

  runTest(
    'valid package type theme',
    (p) => {
      p.type = 'theme';
    },
    false,
  );

  runTest(
    'valid package type mu-plugin',
    (p) => {
      p.type = 'mu-plugin';
    },
    false,
  );

  runTest(
    'invalid version',
    (p) => {
      p.version = '1.0';
    },
    true,
  );

  runTest(
    'invalid version format',
    (p) => {
      p.version = 'v1.0.0';
    },
    true,
  );

  runTest(
    'optional requires struct is present but has undefined fields',
    (p) => {
      p.requires = {
        wp: undefined,
        php: undefined,
      };
    },
    false,
  );

  runTest(
    'invalid requires wp constraint',
    (p) => {
      p.requires!.wp = 'invalid';
    },
    true,
  );

  runTest(
    'invalid version constraint format with v',
    (p) => {
      p.requires = { wp: 'v5.0' };
    },
    true,
  );

  runTest(
    'license too short',
    (p) => {
      p.license = 'a';
    },
    true,
  );

  runTest(
    'license min length',
    (p) => {
      p.license = 'GPL';
    },
    false,
  );

  runTest(
    'license max length',
    (p) => {
      p.license = 'a'.repeat(100);
    },
    false,
  );

  runTest(
    'license too long',
    (p) => {
      p.license = 'a'.repeat(101);
    },
    true,
  );

  runTest(
    'homepage url too short',
    (p) => {
      p.homepage = 'http://a';
    },
    true,
  );

  runTest(
    'homepage url min length',
    (p) => {
      p.homepage = 'http://a.b';
    },
    false,
  );

  runTest(
    'homepage url max length',
    (p) => {
      p.homepage = `https://${'a'.repeat(191)}`;
    },
    false,
  );

  runTest(
    'homepage url too long',
    (p) => {
      p.homepage = `https://${'a'.repeat(193)}`;
    },
    true,
  );

  runTest(
    'invalid homepage url format',
    (p) => {
      p.homepage = 'not-a-url';
    },
    true,
  );

  runTest(
    'homepage is a FTP url',
    (p) => {
      p.homepage = 'ftp://example.com/resource';
    },
    true,
  );

  runTest(
    'homepage is a mailto url',
    (p) => {
      p.homepage = 'mailto:user@example.com';
    },
    true,
  );

  runTest(
    'homepage url is missing a scheme',
    (p) => {
      p.homepage = 'www.example.com';
    },
    true,
  );

  runTest(
    'tags at max count',
    (p) => {
      p.tags = ['one', 'two', 'three', 'four', 'five'];
    },
    false,
  );

  runTest(
    'too many tags',
    (p) => {
      p.tags = ['one', 'two', 'three', 'four', 'five', 'six'];
    },
    true,
  );

  runTest(
    'tags slice with an empty string element',
    (p) => {
      p.tags = ['ok', ''];
    },
    true,
  );

  runTest(
    'a tag is too short',
    (p) => {
      p.tags = ['a'];
    },
    true,
  );

  runTest(
    'a tag at min length',
    (p) => {
      p.tags = ['ab'];
    },
    false,
  );

  runTest(
    'a tag at max length',
    (p) => {
      p.tags = ['a'.repeat(64)];
    },
    false,
  );

  runTest(
    'a tag is too long',
    (p) => {
      p.tags = ['ok', 'a'.repeat(65)];
    },
    true,
  );

  runTest(
    'tags contain duplicates',
    (p) => {
      p.tags = ['plugin', 'plugin'];
    },
    true,
  );

  runTest(
    'team contain duplicates',
    (p) => {
      p.team = ['member', 'member'];
    },
    true,
  );

  runTest(
    'team at max count',
    (p) => {
      p.team = Array.from({ length: 100 }, (_, i) => `member-${i}`);
    },
    false,
  );

  runTest(
    'too many team members',
    (p) => {
      p.team = Array(101).fill('member');
    },
    true,
  );

  runTest(
    'team slice with an empty string element',
    (p) => {
      p.team = ['ok', ''];
    },
    true,
  );

  runTest(
    'a team member is too short',
    (p) => {
      p.team = ['a'];
    },
    true,
  );

  runTest(
    'a team member at min length',
    (p) => {
      p.team = ['ab'];
    },
    false,
  );

  runTest(
    'a team member at max length',
    (p) => {
      p.team = ['a'.repeat(100)];
    },
    false,
  );

  runTest(
    'a team member is too long',
    (p) => {
      p.team = ['a'.repeat(101)];
    },
    true,
  );

  runTest(
    'dependencies at max count',
    (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 16; i++) {
        deps[`dep-${i}`] = '1.0.0';
      }
      p.dependencies = deps;
    },
    false,
  );

  runTest(
    'too many dependencies',
    (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 17; i++) {
        deps[`dep-${i}`] = '1.0.0';
      }
      p.dependencies = deps;
    },
    true,
  );

  runTest(
    'invalid dependency key name',
    (p) => {
      p.dependencies = { 'invalid name': '1.0.0' };
    },
    true,
  );

  runTest(
    'dependencies map with empty key',
    (p) => {
      p.dependencies = { '': '1.0.0' };
    },
    true,
  );

  runTest(
    'invalid dependency version',
    (p) => {
      p.dependencies = { 'valid-name': '1.0' };
    },
    true,
  );

  runTest(
    'valid wildcard dependency version',
    (p) => {
      p.dependencies = { 'valid-name': '*' };
    },
    false,
  );

  runTest(
    'devDependencies at max count',
    (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 16; i++) {
        deps[`dev-dep-${i}`] = '1.0.0';
      }
      p.devDependencies = deps;
    },
    false,
  );

  runTest(
    'too many devDependencies',
    (p) => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 17; i++) {
        deps[`dev-dep-${i}`] = '1.0.0';
      }
      p.devDependencies = deps;
    },
    true,
  );

  runTest(
    'invalid devDependency key name',
    (p) => {
      p.devDependencies = { 'invalid dev name': '1.0.0' };
    },
    true,
  );

  runTest(
    'empty dependency',
    (p) => {
      p.dependencies = {};
    },
    false,
  );

  runTest(
    'empty devDependency',
    (p) => {
      p.devDependencies = {};
    },
    false,
  );

  runTest(
    'dist totalFiles is zero',
    (p) => {
      p.dist.totalFiles = 0;
    },
    true,
  );

  runTest(
    'dist totalFiles is negative',
    (p) => {
      p.dist.totalFiles = -1;
    },
    true,
  );

  runTest(
    'dist packedSize is zero',
    (p) => {
      p.dist.packedSize = 0;
    },
    true,
  );

  runTest(
    'dist packedSize is greater than 128MB',
    (p) => {
      p.dist.packedSize = 128 * 1024 * 1024 + 1;
    },
    true,
  );

  runTest(
    'dist unpackedSize is zero',
    (p) => {
      p.dist.unpackedSize = 0;
    },
    true,
  );

  runTest(
    'invalid dist digest',
    (p) => {
      p.dist.digest = 'invalid';
    },
    true,
  );

  runTest(
    'missing required meta tag',
    (p) => {
      p.tag = '';
    },
    true,
  );

  runTest(
    'invalid meta tag',
    (p) => {
      p.tag = 'INVALID_TAG';
    },
    true,
  );

  runTest(
    'invalid meta wpm version',
    (p) => {
      p._wpm = '1.0';
    },
    true,
  );

  runTest(
    'invalid visibility',
    (p) => {
      // @ts-expect-error -- testing invalid visibility
      p.visibility = 'protected';
    },
    true,
  );

  runTest(
    'valid visibility private',
    (p) => {
      p.visibility = 'private';
    },
    false,
  );

  runTest(
    'readme exceeds 50KB size limit',
    (p) => {
      p.readme = 'a'.repeat(50 * 1024 + 1);
    },
    true,
  );

  runTest(
    'readme at 50KB size limit',
    (p) => {
      p.readme = 'a'.repeat(50 * 1024);
    },
    false,
  );

  runTest(
    'readme is empty string',
    (p) => {
      p.readme = '';
    },
    false,
  );
});

describe('ValidatePackageName', () => {
  const cases = [
    { name: 'valid name', input: 'my-awesome-package', isValid: true },
    { name: 'valid name with numbers', input: 'package-123', isValid: true },
    { name: 'valid min length', input: 'abc', isValid: true },
    { name: 'valid max length', input: 'a'.repeat(164), isValid: true },
    { name: 'invalid too short', input: 'ab', isValid: false },
    { name: 'invalid too long', input: 'a'.repeat(165), isValid: false },
    { name: 'invalid with underscores', input: 'my_package', isValid: false },
    { name: 'invalid starting with hyphen', input: '-mypackage', isValid: false },
    { name: 'invalid ending with hyphen', input: 'mypackage-', isValid: false },
    { name: 'invalid consecutive hyphens', input: 'my--package', isValid: false },
    { name: 'invalid with mixed case', input: 'MyPackage', isValid: false },
    { name: 'invalid with space', input: 'my package', isValid: false },
    { name: 'invalid with special chars', input: 'my-package!', isValid: false },
    { name: 'invalid with slash', input: 'vendor/package', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(PackageNameSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateSemver', () => {
  const cases = [
    { name: 'valid simple', input: '1.2.3', isValid: true },
    { name: 'valid with prerelease', input: '1.0.0-alpha.1', isValid: true },
    { name: 'valid with build metadata', input: '1.0.0+build.123', isValid: true },
    { name: 'valid min length', input: '1.0.0', isValid: true },
    {
      name: 'valid max length',
      input: `${'1'.repeat(5)}.${'2'.repeat(5)}.${'3'.repeat(5)}-${'a'.repeat(20)}+${'b'.repeat(20)}`,
      isValid: true,
    },
    {
      name: 'invalid max length',
      input: `${'1'.repeat(21)}.${'2'.repeat(20)}.${'3'.repeat(20)}`,
      isValid: false,
    },
    { name: 'invalid too short length', input: '1.0', isValid: false },
    { name: 'invalid just too short length', input: '1.2.', isValid: false },
    {
      name: 'invalid too long length',
      input: `${'1'.repeat(22)}.${'2'.repeat(22)}.${'3'.repeat(22)}`,
      isValid: false,
    },
    { name: 'invalid with v prefix', input: 'v1.2.3', isValid: false },
    { name: 'invalid format', input: '1.2', isValid: false },
    { name: 'invalid non-numeric', input: 'a.b.c', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(SemverSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateDistTag', () => {
  const cases = [
    { name: 'valid latest', input: 'latest', isValid: true },
    { name: 'valid beta', input: 'beta', isValid: true },
    { name: 'valid with numbers', input: 'next-1', isValid: true },
    { name: 'valid min length', input: 'dev', isValid: true },
    { name: 'valid max length', input: 'a'.repeat(64), isValid: true },
    { name: 'invalid too short', input: 'a', isValid: false },
    { name: 'invalid just too short', input: 'ab', isValid: false },
    { name: 'invalid too long', input: 'a'.repeat(65), isValid: false },
    { name: 'invalid uppercase', input: 'LATEST', isValid: false },
    { name: 'invalid with underscore', input: 'next_major', isValid: false },
    { name: 'invalid with special char', input: 'beta!', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(DistTagSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateSemverConstraint', () => {
  const cases = [
    { name: 'valid caret', input: '^1.2.3', isValid: true },
    { name: 'valid tilde', input: '~1.2.3', isValid: true },
    { name: 'valid wildcard', input: '1.x', isValid: true },
    { name: 'valid without patch', input: '1.2', isValid: true },
    { name: 'valid exact', input: '1.2.3', isValid: true },
    { name: 'valid without minor and patch', input: '1', isValid: true },
    { name: 'valid without patch and with caret', input: '^1.2', isValid: true },
    { name: 'valid without minor and patch with tilde', input: '~1', isValid: true },
    { name: 'valid comparison', input: '>=1.2.7', isValid: true },
    { name: 'valid range', input: '>= 1.2.0 < 2.0.0', isValid: true },
    { name: 'valid hyphen range', input: '1.2.0 - 2.0.0', isValid: true },
    { name: 'invalid with v prefix', input: 'v1.2.3', isValid: false },
    { name: 'invalid operator', input: '?1.2.0', isValid: false },
    { name: 'invalid characters', input: '>=1.2.c', isValid: false },
    { name: 'incomplete range', input: '> 1.2.0,', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(SemverConstraintSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateDigest', () => {
  const validHash = Buffer.alloc(32).toString('base64');

  const cases = [
    { name: 'valid digest with prefix', input: `sha256:${validHash}`, isValid: true },
    {
      name: 'valid digest without prefix (invalid in strict schema)',
      input: validHash,
      isValid: false,
    },
    { name: 'invalid prefix', input: `sha512:${validHash}`, isValid: false },
    { name: 'invalid base64', input: 'sha256:not-valid-base64-$%^', isValid: false },
    {
      name: 'invalid hash length (short)',
      input: `sha256:${Buffer.alloc(31).toString('base64')}`,
      isValid: false,
    },
    {
      name: 'invalid hash length (long)',
      input: `sha256:${Buffer.alloc(33).toString('base64')}`,
      isValid: false,
    },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(DigestSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateHttpURL', () => {
  const cases = [
    { name: 'valid https', input: 'https://example.com', isValid: true },
    { name: 'valid http', input: 'http://example.com/path?query=value', isValid: true },
    { name: 'invalid scheme ftp', input: 'ftp://example.com', isValid: false },
    { name: 'invalid scheme-relative', input: '//example.com', isValid: false },
    { name: 'invalid no scheme', input: 'example.com', isValid: false },
    // starting zod:4.4.0, zod treat malformed URLs missing slash after protocol as invalid.
    { name: 'invalid malformed', input: 'http:/example.com', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(PackageSchema.shape.homepage, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});

describe('ValidateDependencyVersion', () => {
  const cases = [
    { name: 'valid semver', input: '1.2.3', isValid: true },
    { name: 'valid semver with constraint', input: '~1.2.3', isValid: false },
    { name: 'valid semver with prerelease', input: '2.0.0-beta.1', isValid: true },
    { name: 'valid wildcard', input: '*', isValid: true },
    { name: 'invalid partial semver', input: '1.2', isValid: false },
    { name: 'invalid with v prefix', input: 'v1.0.0', isValid: false },
    { name: 'invalid wildcard with other chars', input: '*.*', isValid: false },
    { name: 'invalid text', input: 'latest', isValid: false },
    { name: 'empty string', input: '', isValid: false },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const result = validateVar(DependencyVersionSchema, c.input);
      if (c.isValid) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
      }
    });
  }
});
