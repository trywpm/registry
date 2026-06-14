import * as z from 'zod/v4-mini';
import { isStrictSemver, isValidConstraint } from '@wpm/semver-lite';
import { PACKAGE_NAME_REGEX, DIST_TAG_REGEX } from '@wpm/types';

// Load English locale for zod error messages.
//
// This is loaded directly to avoid loading all of zod's locales
// which would increase the bundle size significantly.
import en from 'zod/v4/locales/en.js';

z.config(en());

export type PackageSignature = { keyid: string; sig: string };

const MAX_DEPENDENCIES = 16;
const MAX_TOTAL_FILES = 50_000;

const MAX_COMPRESSED_SIZE = 128 * 1024 * 1024; // 128 MB
const MAX_COMPRESSION_RATIO = 250;
const RATIO_CHECK_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const MAX_DECOMPRESSED_SIZE = 512 * 1024 * 1024; // 512 MB

const DIGEST_REGEX = /^sha256:[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

export const DANGEROUS_CHARS_REGEX = new RegExp(
  '((?![' +
    '\\t\\n\\r' + // standard whitespace
    '\\u200C' + // ZWNJ — required for Persian, Urdu, Devanagari
    '\\u200D' + // ZWJ — for complex emoji sequences
    '\\u{E0020}-\\u{E007F}' + // Emoji Tag chars (subdivision flags like Scotland)
    '])' +
    '\\p{C})|' + // Other (Cf/Cc/Co/Cs/Cn) beyond the allowlist
    '[' +
    '\\u2028' + // Line Separator (Zl) — breaks JS eval
    '\\u2029' + // Paragraph Separator (Zp) — breaks JS eval
    '\\uFFFD' + // Replacement Character — implies encoding error
    '\\uFFFC' + // Object Replacement Character
    '\\u3164' + // Hangul Filler — used for invisible usernames
    ']',
  'u',
);
const WEIRD_LINE_BREAKS_REGEX = /[\u2028\u2029]/g;
// oxlint-disable-next-line no-control-regex
const BAD_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD\uFFFC]/g;
const CONTROL_CHAR_ERROR = 'contains invalid control characters or invisible formatting';

const reserved = new Set([
  // windows reserved filenames
  'con',
  'prn',
  'aux',
  'nul',
  'com0',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt0',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',

  // wp reserved names
  'wp',
  'plugins',
  'themes',
  'wp-admin',
  'wp-config',
  'wp-content',
  'mu-plugins',
  'wp-includes',
]);

export const PackageNameSchema = z.string().check(
  z.minLength(3, 'package name must be at least 3 characters'),
  z.maxLength(164, 'package name must be at most 164 characters'),
  z.regex(
    PACKAGE_NAME_REGEX,
    'package name must consist of lowercase alphanumeric characters separated by hyphens',
  ),
  z.refine((name) => !reserved.has(name.toLowerCase()), {
    error: (issue) => `${String(issue.input)} is a restricted package name`,
  }),
);

export const SemverSchema = z.string().check(
  z.minLength(5, 'version must be at least 5 characters'),
  z.maxLength(64, 'version must be at most 64 characters'),
  z.refine((v) => v === v.trim(), 'version cannot contain leading or trailing whitespace'),
  z.refine((v) => !v.startsWith('v'), "version cannot start with 'v'"),
  z.refine((v) => isStrictSemver(v), 'version must be a valid semantic version'),
);

export const SemverConstraintSchema = z.string().check(
  z.minLength(1, 'version constraint cannot be empty'),
  z.maxLength(64, 'version constraint must be at most 64 characters'),
  z.refine(
    (v) => v === v.trim(),
    'version constraint cannot contain leading or trailing whitespace',
  ),
  z.refine((v) => !v.startsWith('v'), "version constraint cannot start with 'v'"),
  z.refine((v) => isValidConstraint(v), 'version constraint must be a valid semver range'),
);

export const DistTagSchema = z._default(
  z.string().check(
    z.minLength(3, 'tag must be at least 3 characters'),
    z.maxLength(64, 'tag must be at most 64 characters'),
    z.regex(
      DIST_TAG_REGEX,
      'tag must consist of lowercase alphanumeric characters separated by hyphens',
    ),
    z.refine((t) => !isValidConstraint(t), 'tag cannot resemble a valid semantic version or range'),
  ),
  'latest',
);

export const DependencyVersionSchema = z
  .string()
  .check(
    z.refine(
      (val) => val.length <= 64 && isStrictSemver(val),
      'dependency version must be a valid semantic version',
    ),
  );

export const DigestSchema = z
  .string()
  .check(
    z.regex(
      DIGEST_REGEX,
      "digest must be 'sha256:' followed by a 43-character base64-encoded hash",
    ),
  );

const DescriptionField = z.string().check(
  z.trim(),
  z.refine((desc) => !DANGEROUS_CHARS_REGEX.test(desc), `description ${CONTROL_CHAR_ERROR}`),
  z.minLength(3, 'description must be at least 3 characters'),
  z.maxLength(512, 'description must be at most 512 characters'),
);

const LicenseField = z.string().check(
  z.normalize('NFC'),
  z.trim(),
  z.refine((lic) => !DANGEROUS_CHARS_REGEX.test(lic), `license ${CONTROL_CHAR_ERROR}`),
  z.minLength(3, 'license must be at least 3 characters'),
  z.maxLength(100, 'license must be at most 100 characters'),
);

const HomepageField = z
  .url({
    protocol: /^https?$/,
    error: 'homepage must be a valid URL',
  })
  .check(
    z.minLength(10, 'homepage url must be at least 10 characters'),
    z.maxLength(200, 'homepage url must be at most 200 characters'),
  );

const TagsField = z
  .array(
    z.string().check(
      z.normalize('NFC'),
      z.trim(),
      z.refine((tag) => !DANGEROUS_CHARS_REGEX.test(tag), `tag items ${CONTROL_CHAR_ERROR}`),
      z.minLength(2, 'tag must be at least 2 characters'),
      z.maxLength(64, 'tag must be at most 64 characters'),
    ),
  )
  .check(
    z.maxLength(5, 'tags must not have more than 5 items'),
    z.refine((tags) => new Set(tags).size === tags.length, 'tags must be unique'),
  );

const AuthorField = z.pipe(
  z.string().check(z.normalize('NFC'), z.trim()),
  z.string().check(
    z.minLength(2, 'author name must be at least 2 characters'),
    z.maxLength(164, 'author name must be at most 164 characters'),
    z.refine((name) => !DANGEROUS_CHARS_REGEX.test(name), `author field ${CONTROL_CHAR_ERROR}`),
  ),
);

const PackageTypeEnum = z.enum(['theme', 'plugin'], {
  error: 'type must be one of theme or plugin',
});

const PackageVisibilityEnum = z.enum(['public', 'private'], {
  error: 'visibility must be public or private',
});

const RequirementsSchema = z.strictObject({
  wp: z.optional(SemverConstraintSchema),
  php: z.optional(SemverConstraintSchema),
});

const PackageDistSchema = z
  .strictObject({
    digest: DigestSchema,
    totalFiles: z
      .number()
      .check(
        z.int(),
        z.gt(0, 'total files must be greater than 0'),
        z.lte(MAX_TOTAL_FILES, `total files must not exceed ${MAX_TOTAL_FILES}`),
      ),
    packedSize: z
      .number()
      .check(
        z.int(),
        z.gt(0, 'tarball size must be greater than 0'),
        z.lte(
          MAX_COMPRESSED_SIZE,
          `tarball size must not exceed ${MAX_COMPRESSED_SIZE / (1024 * 1024)}MB`,
        ),
      ),
    unpackedSize: z
      .number()
      .check(
        z.int(),
        z.gt(0, 'unpacked size must be greater than 0'),
        z.lte(
          MAX_DECOMPRESSED_SIZE,
          `unpacked size must not exceed ${MAX_DECOMPRESSED_SIZE / (1024 * 1024)}MB`,
        ),
      ),
    signatures: z.pipe(
      z.optional(z.null()),
      z.transform((): PackageSignature[] => {
        return [];
      }),
    ),
  })
  .check(
    z.refine(
      (d) =>
        d.packedSize < RATIO_CHECK_THRESHOLD ||
        d.unpackedSize / d.packedSize <= MAX_COMPRESSION_RATIO,
      'tarball compression ratio exceeds 99.6% (potential zip bomb)',
    ),
  );

const DependenciesSchema = z
  .record(PackageNameSchema, DependencyVersionSchema)
  .check(
    z.refine(
      (d) => Object.keys(d).length <= MAX_DEPENDENCIES,
      `cannot have more than ${MAX_DEPENDENCIES} (dev)dependencies`,
    ),
  );

const ReadmeField = z.pipe(
  z.string().check(z.trim(), z.maxLength(100 * 1024, 'readme must be at most 100KB')),
  z.transform((val) =>
    val.replace(WEIRD_LINE_BREAKS_REGEX, ' ').replace(BAD_CHARS_REGEX, '').trim(),
  ),
);

type PackageWithDeps = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const checkDependencyIntegrity = (pkg: PackageWithDeps, ctx: z.core.$RefinementCtx) => {
  if (pkg.dependencies?.[pkg.name] != null || pkg.devDependencies?.[pkg.name] != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['dependencies'],
      message: 'package cannot depend on itself',
    });
  }

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (pkg.devDependencies?.[dep] != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['devDependencies', dep],
        message: `package '${dep}' cannot be listed in both dependencies and devDependencies`,
      });
    }
  }
};

export const PackageSchema = z
  .strictObject({
    name: PackageNameSchema,
    description: z.optional(DescriptionField),
    type: PackageTypeEnum,
    version: SemverSchema,
    requires: z.optional(RequirementsSchema),
    license: z.optional(LicenseField),
    author: z.optional(AuthorField),
    homepage: z.optional(HomepageField),
    tags: z.optional(TagsField),
    dependencies: z.optional(DependenciesSchema),
    devDependencies: z.optional(DependenciesSchema),
    tag: DistTagSchema,
    _wpm: SemverSchema,
    visibility: PackageVisibilityEnum,
    dist: PackageDistSchema,
    readme: z.optional(ReadmeField),
  })
  .check(
    z.superRefine((pkg, ctx) => {
      checkDependencyIntegrity(pkg, ctx);
    }),
  );

export type Package = z.infer<typeof PackageSchema>;
export type PackageInput = z.input<typeof PackageSchema>;

export const formatZodError = (error: z.core.$ZodError): string => {
  const issue = error.issues.find((i) => i.code !== 'unrecognized_keys') ?? error.issues[0];
  const path = issue.path.join('.');

  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys.join(', ');
    return path ? `unrecognized field(s) in '${path}': ${keys}` : `unrecognized field(s): ${keys}`;
  }

  let message = issue.message.toLowerCase();

  if (!path) {
    return message;
  }

  const pathParts = issue.path.map((p) => String(p).toLowerCase());
  const hasPathInMessage = pathParts.some((p) => message.includes(p));

  if (!hasPathInMessage) {
    message = `invalid field '${path}': ${message}`;
  }

  return message;
};
