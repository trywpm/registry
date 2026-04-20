import { z } from 'zod/v4';
import { valid, validRange } from 'semver';

const PACKAGE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DANGEROUS_CHARS_REGEX = new RegExp(
  '((?![' +
    '\\t\\n\\r' + // Allow standard whitespace
    '\\u200D' + // Allow ZWJ (for complex emoji sequences)
    '\\u{E0020}-\\u{E007F}' + // Allow Emoji Tag characters (for subdivision flags like Scotland)
    '])' +
    '\\p{C})|' + // Other, Control characters
    '[' +
    '\\u2028' + // Line Separator (Category Zl) - breaks JS eval
    '\\u2029' + // Paragraph Separator (Category Zp) - breaks JS eval
    '\\uFFFD' + // Replacement Character (Category So) - implies encoding error
    '\\uFFFC' + // Object Replacement Character
    '\\u3164' + // Hangul Filler (Category Lo) - used for invisible usernames
    ']',
  'u', // Unicode flag is required
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
  .refine((v) => !v.startsWith('v'), {
    message: "version constraint cannot start with 'v'",
  })
  .refine((v) => valid(v, { loose: false }) !== null, {
    message: 'version must be a valid semantic version',
  });

export const SemverConstraintSchema = z
  .string()
  .min(1, 'version constraint cannot be empty')
  .max(64, 'version constraint must be at most 64 characters')
  .refine((v) => !v.startsWith('v'), {
    message: "version constraint cannot start with 'v'",
  })
  .refine((v) => validRange(v) !== null, {
    message: 'version constraint must be a valid semver range',
  });

export const DistTagSchema = z
  .string()
  .min(3, 'tag must be at least 3 characters')
  .max(64, 'tag must be at most 64 characters')
  .regex(
    PACKAGE_NAME_REGEX,
    'tag must consist of lowercase alphanumeric characters separated by hyphens',
  )
  .default('latest');

export const DependencyVersionSchema = z
  .string()
  .refine((val) => val === '*' || SemverSchema.safeParse(val).success, {
    message: "dependency version must be '*' or a valid semantic version",
  });

const Sha256Base64 = z.hash('sha256', { enc: 'base64' });

export const DigestSchema = z
  .string()
  .refine((val) => val.startsWith('sha256:'), {
    message: "digest must start with 'sha256:' prefix",
  })
  .refine((val) => Sha256Base64.safeParse(val.slice(7)).success, {
    message: 'digest must be a valid base64-encoded sha256 hash',
  });

const PackageTypeEnum = z.enum(['theme', 'plugin', 'mu-plugin'], {
  error: 'type must be one of theme, plugin, or mu-plugin',
});

const PackageVisibilityEnum = z.enum(['public', 'private'], {
  error: 'visibility must be public or private',
});

const RequirementsSchema = z.object({
  wp: SemverConstraintSchema.optional(),
  php: SemverConstraintSchema.optional(),
});

const PackageDistSchema = z.object({
  digest: DigestSchema,
  totalFiles: z.number().int().gt(0, 'total files must be greater than 0'),
  packedSize: z
    .number()
    .int()
    .gt(0, 'tarball size must be greater than 0')
    .lte(128 * 1024 * 1024, 'tarball size must not exceed 128MB'),
  unpackedSize: z.number().int().gt(0, 'unpacked size must be greater than 0'),
});

const DependenciesSchema = z
  .record(PackageNameSchema, DependencyVersionSchema)
  .refine((d) => Object.keys(d).length <= 16, {
    message: 'cannot have more than 16 (dev)dependencies',
  });

export const PackageSchema = z.object({
  // --------------------------------- //
  // -------- wpmjson config --------- //
  // --------------------------------- //
  name: PackageNameSchema,
  description: z
    .string()
    .trim()
    .refine((desc) => !DANGEROUS_CHARS_REGEX.test(desc), {
      message: `description ${CONTROL_CHAR_ERROR}`,
    })
    .min(3, 'description must be at least 3 characters')
    .max(512, 'description must be at most 512 characters')
    .optional(),
  type: PackageTypeEnum,
  version: SemverSchema,
  requires: RequirementsSchema.optional(),
  license: z
    .string()
    .trim()
    .refine((lic) => !DANGEROUS_CHARS_REGEX.test(lic), {
      message: `license ${CONTROL_CHAR_ERROR}`,
    })
    .min(3, 'license must be at least 3 characters')
    .max(100, 'license must be at most 100 characters')
    .optional(),
  homepage: z
    .url({
      protocol: /^https?$/,
      message: 'homepage must be a valid URL',
    })
    .min(10, 'homepage url must be at least 10 characters')
    .max(200, 'homepage url must be at most 200 characters')
    .optional(),
  tags: z
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
    })
    .optional(),
  team: z
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
    })
    .optional(),
  dependencies: DependenciesSchema.optional(),
  devDependencies: DependenciesSchema.optional(),

  // --------------------------------- //
  // ------- wpm internal meta ------- //
  // --------------------------------- //
  tag: DistTagSchema,
  _wpm: SemverSchema,
  visibility: PackageVisibilityEnum,
  dist: PackageDistSchema,
  readme: z
    .string()
    .trim()
    .max(50 * 1024, 'readme must be at most 50KB')
    .transform((val) =>
      val.replace(WEIRD_LINE_BREAKS_REGEX, ' ').replace(BAD_CHARS_REGEX, '').trim(),
    )
    .optional(),
});

export type Package = z.infer<typeof PackageSchema>;
