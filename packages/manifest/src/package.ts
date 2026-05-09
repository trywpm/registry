import { z } from 'zod/v4';
import { valid, validRange } from 'semver';
import { PACKAGE_NAME_REGEX, DIST_TAG_REGEX } from '@wpm/util/constants';

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

export const PackageNameSchema = z
  .string()
  .min(3, 'package name must be at least 3 characters')
  .max(164, 'package name must be at most 164 characters')
  .regex(
    PACKAGE_NAME_REGEX,
    'package name must consist of lowercase alphanumeric characters separated by hyphens',
  );

export const SemverSchema = z
  .string()
  .min(5, 'version must be at least 5 characters')
  .max(64, 'version must be at most 64 characters')
  .refine((v) => v === v.trim(), {
    message: 'version cannot contain leading or trailing whitespace',
  })
  .refine((v) => !v.startsWith('v'), {
    message: "version cannot start with 'v'",
  })
  .refine((v) => valid(v, { loose: false }) != null, {
    message: 'version must be a valid semantic version',
  });

export const SemverConstraintSchema = z
  .string()
  .min(1, 'version constraint cannot be empty')
  .max(64, 'version constraint must be at most 64 characters')
  .refine((v) => v === v.trim(), {
    message: 'version constraint cannot contain leading or trailing whitespace',
  })
  .refine((v) => !v.startsWith('v'), {
    message: "version constraint cannot start with 'v'",
  })
  .refine((v) => validRange(v) != null, {
    message: 'version constraint must be a valid semver range',
  });

export const DistTagSchema = z
  .string()
  .min(3, 'tag must be at least 3 characters')
  .max(64, 'tag must be at most 64 characters')
  .regex(
    DIST_TAG_REGEX,
    'tag must consist of lowercase alphanumeric characters separated by hyphens',
  )
  .refine((t) => valid(t) == null && validRange(t) == null, {
    message: 'tag cannot resemble a valid semantic version or range',
  })
  .default('latest');

export const DependencyVersionSchema = z
  .string()
  .refine((val) => val === '*' || SemverSchema.safeParse(val).success, {
    message: "dependency version must be '*' or a valid semantic version",
  });

export const DigestSchema = z
  .string()
  .regex(DIGEST_REGEX, "digest must be 'sha256:' followed by a 43-character base64-encoded hash");

const DescriptionField = z
  .string()
  .trim()
  .refine((desc) => !DANGEROUS_CHARS_REGEX.test(desc), {
    message: `description ${CONTROL_CHAR_ERROR}`,
  })
  .min(3, 'description must be at least 3 characters')
  .max(512, 'description must be at most 512 characters');

const LicenseField = z
  .string()
  .trim()
  .refine((lic) => !DANGEROUS_CHARS_REGEX.test(lic), {
    message: `license ${CONTROL_CHAR_ERROR}`,
  })
  .min(3, 'license must be at least 3 characters')
  .max(100, 'license must be at most 100 characters');

const HomepageField = z
  .url({
    protocol: /^https?$/,
    message: 'homepage must be a valid URL',
  })
  .min(10, 'homepage url must be at least 10 characters')
  .max(200, 'homepage url must be at most 200 characters');

const TagsField = z
  .array(
    z
      .string()
      .trim()
      .refine((tag) => !DANGEROUS_CHARS_REGEX.test(tag), {
        message: `tag items ${CONTROL_CHAR_ERROR}`,
      })
      .min(2, 'tag must be at least 2 characters')
      .max(64, 'tag must be at most 64 characters'),
  )
  .max(5, 'tags must not have more than 5 items')
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'tags must be unique',
  });

const TeamField = z
  .array(
    z
      .string()
      .trim()
      .refine((member) => !DANGEROUS_CHARS_REGEX.test(member), {
        message: `team member ${CONTROL_CHAR_ERROR}`,
      })
      .min(2, 'team member must be at least 2 characters')
      .max(100, 'team member must be at most 100 characters'),
  )
  .max(100, 'team must not have more than 100 members')
  .refine((members) => new Set(members).size === members.length, {
    message: 'team members must be unique',
  });

const PackageTypeEnum = z.enum(['theme', 'plugin', 'mu-plugin'], {
  error: 'type must be one of theme, plugin, or mu-plugin',
});

const PackageVisibilityEnum = z.enum(['public', 'private'], {
  error: 'visibility must be public or private',
});

const RequirementsSchema = z.strictObject({
  wp: SemverConstraintSchema.optional(),
  php: SemverConstraintSchema.optional(),
});

const PackageDistSchema = z
  .strictObject({
    digest: DigestSchema,
    totalFiles: z
      .number()
      .int()
      .gt(0, 'total files must be greater than 0')
      .lte(MAX_TOTAL_FILES, `total files must not exceed ${MAX_TOTAL_FILES}`),
    packedSize: z
      .number()
      .int()
      .gt(0, 'tarball size must be greater than 0')
      .lte(
        MAX_COMPRESSED_SIZE,
        `tarball size must not exceed ${MAX_COMPRESSED_SIZE / (1024 * 1024)}MB`,
      ),
    unpackedSize: z
      .number()
      .int()
      .gt(0, 'unpacked size must be greater than 0')
      .lte(
        MAX_DECOMPRESSED_SIZE,
        `unpacked size must not exceed ${MAX_DECOMPRESSED_SIZE / (1024 * 1024)}MB`,
      ),
  })
  .refine(
    (d) =>
      d.packedSize < RATIO_CHECK_THRESHOLD ||
      d.unpackedSize / d.packedSize <= MAX_COMPRESSION_RATIO,
    { message: 'tarball compression ratio exceeds 99.6% (potential zip bomb)' },
  );

const DependenciesSchema = z
  .record(PackageNameSchema, DependencyVersionSchema)
  .refine((d) => Object.keys(d).length <= MAX_DEPENDENCIES, {
    message: `cannot have more than ${MAX_DEPENDENCIES} (dev)dependencies`,
  });

const ReadmeField = z
  .string()
  .trim()
  .max(50 * 1024, 'readme must be at most 50KB')
  .transform((val) =>
    val.replace(WEIRD_LINE_BREAKS_REGEX, ' ').replace(BAD_CHARS_REGEX, '').trim(),
  );

type PackageWithDeps = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const checkDependencyIntegrity = (pkg: PackageWithDeps, ctx: z.RefinementCtx) => {
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
    description: DescriptionField.optional(),
    type: PackageTypeEnum,
    version: SemverSchema,
    requires: RequirementsSchema.optional(),
    license: LicenseField.optional(),
    homepage: HomepageField.optional(),
    tags: TagsField.optional(),
    team: TeamField.optional(),
    dependencies: DependenciesSchema.optional(),
    devDependencies: DependenciesSchema.optional(),
    tag: DistTagSchema,
    _wpm: SemverSchema,
    visibility: PackageVisibilityEnum,
    dist: PackageDistSchema,
    readme: ReadmeField.optional(),
  })
  .superRefine((pkg, ctx) => {
    checkDependencyIntegrity(pkg, ctx);
  });

export type Package = z.infer<typeof PackageSchema>;
