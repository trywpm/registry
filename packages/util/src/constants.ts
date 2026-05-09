const NAMING_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// naming validation
export const DIST_TAG_REGEX = NAMING_REGEX;
export const USERNAME_REGEX = NAMING_REGEX;
export const PACKAGE_NAME_REGEX = NAMING_REGEX;

// package types and visibility
export const PACKAGE_TYPE = ['plugin', 'theme', 'mu-plugin'] as const;
export const PACKAGE_VISIBILITY = ['public', 'private', 'restricted'] as const;

export type PackageType = (typeof PACKAGE_TYPE)[number];
export type PackageVisibility = (typeof PACKAGE_VISIBILITY)[number];
