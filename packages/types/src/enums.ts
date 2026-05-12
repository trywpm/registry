export const PACKAGE_TYPE = ['plugin', 'theme', 'mu-plugin'] as const;
export const PACKAGE_STATUS = ['active', 'deprecated', 'deleted'] as const;
export const PACKAGE_VISIBILITY = ['public', 'private', 'restricted'] as const;

export type PackageType = (typeof PACKAGE_TYPE)[number];
export type PackageStatus = (typeof PACKAGE_STATUS)[number];
export type PackageVisibility = (typeof PACKAGE_VISIBILITY)[number];

export const USER_STATUS = ['active', 'inactive', 'banned', 'locked'] as const;

export type UserStatus = (typeof USER_STATUS)[number];
