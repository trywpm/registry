import type { Role, Action, Resource } from '.';

import { canUser, canToken } from '.';
import { describe, it, expect } from 'vitest';

describe('canUser (RBAC)', () => {
  describe('Admin Role', () => {
    it.each([
      ['team', 'view'],
      ['team', 'edit'],
      ['team', 'delete'],
      ['team', 'manage_members'],
      ['package', 'view'],
      ['package', 'delete'],
      ['package', 'publish'],
      ['package', 'deprecate'],
      ['package', 'manage_members'],
    ] as [Resource, Action][])('allows admin to %s on %s', (resource, action) => {
      expect(canUser('admin', action, resource)).toBe(true);
    });
  });

  describe('Maintainer Role', () => {
    it.each([
      ['team', 'view'],
      ['team', 'edit'],
      ['team', 'manage_members'],
      ['package', 'view'],
      ['package', 'publish'],
      ['package', 'deprecate'],
      ['package', 'manage_members'],
    ] as [Resource, Action][])('allows maintainer to %s on %s', (resource, action) => {
      expect(canUser('maintainer', action, resource)).toBe(true);
    });

    it.each([
      ['team', 'delete'],
      ['package', 'delete'],
    ] as [Resource, Action][])('denies maintainer to %s on %s', (resource, action) => {
      expect(canUser('maintainer', action, resource)).toBe(false);
    });
  });

  describe('Viewer Role', () => {
    it.each([
      ['team', 'view'],
      ['package', 'view'],
    ] as [Resource, Action][])('allows viewer to %s on %s', (resource, action) => {
      expect(canUser('viewer', action, resource)).toBe(true);
    });

    it.each([
      ['team', 'edit'],
      ['team', 'delete'],
      ['team', 'manage_members'],
      ['package', 'publish'],
      ['package', 'delete'],
      ['package', 'deprecate'],
      ['package', 'manage_members'],
    ] as [Resource, Action][])('denies viewer to %s on %s', (resource, action) => {
      expect(canUser('viewer', action, resource)).toBe(false);
    });
  });

  describe('Runtime Boundary Safety (Bypassing TypeScript)', () => {
    it.each([null, undefined, 'hacker', 123, {}, []])(
      'returns false gracefully for completely invalid role: %s',
      (invalidRole) => {
        // @ts-expect-error - intentionally bypassing type safety to test runtime behavior
        expect(canUser(invalidRole, 'view', 'team')).toBe(false);
      },
    );

    it.each([null, undefined, 'database', 123, {}, []])(
      'returns false gracefully for invalid resource: %s',
      (invalidResource) => {
        // @ts-expect-error - intentionally bypassing type safety to test runtime behavior
        expect(canUser('admin', 'view', invalidResource)).toBe(false);
      },
    );

    it.each([null, undefined, 'destroy', 123, {}, []])(
      'returns false gracefully for invalid action: %s',
      (invalidAction) => {
        // @ts-expect-error - intentionally bypassing type safety to test runtime behavior
        expect(canUser('admin', invalidAction, 'team')).toBe(false);
      },
    );
  });
});

describe('canToken (Scope Based Access)', () => {
  const mockScopes = ['team:view', 'package:publish', 'package:view'];

  it('returns true when exact scope is present', () => {
    expect(canToken(mockScopes, 'view', 'team')).toBe(true);
    expect(canToken(mockScopes, 'publish', 'package')).toBe(true);
  });

  it('returns false when scope is missing entirely', () => {
    expect(canToken(mockScopes, 'delete', 'package')).toBe(false);
    expect(canToken(mockScopes, 'manage_members', 'team')).toBe(false);
  });

  it('returns false when resource matches but action differs', () => {
    expect(canToken(mockScopes, 'edit', 'team')).toBe(false);
  });

  it('returns false for empty token scopes', () => {
    expect(canToken([], 'view', 'team')).toBe(false);
  });

  it('handles exact substring mismatches correctly (no false positives)', () => {
    const deceptiveScopes = ['package:view_all', 'myteam:view'];
    expect(canToken(deceptiveScopes, 'view', 'package')).toBe(false);
    expect(canToken(deceptiveScopes, 'view', 'team')).toBe(false);
  });
});

describe('Strictness: Prototype & Built-in Object Properties', () => {
  it.each(['__proto__', 'constructor', 'hasOwnProperty', 'isPrototypeOf', 'toString', 'valueOf'])(
    'denies access if action is a built-in object property: "%s"',
    (maliciousAction) => {
      // @ts-expect-error - bypassing TS to test malicious runtime payloads
      expect(canUser('admin', maliciousAction, 'team')).toBe(false);
    },
  );

  it('denies access if role is a built-in object property', () => {
    // @ts-expect-error - bypassing TS to test malicious runtime payloads
    expect(canUser('toString', 'view', 'team')).toBe(false);
  });
});

describe('Strictness: Case Sensitivity & Whitespace', () => {
  it.each([
    ['Admin', 'view', 'team'],
    ['ADMIN', 'view', 'team'],
    ['admin', 'View', 'team'],
    ['admin', 'view', 'Team'],
  ])('denies access for improperly cased inputs: %s, %s, %s', (role, action, resource) => {
    // @ts-expect-error - bypassing TS to test case sensitivity at runtime
    expect(canUser(role, action, resource)).toBe(false);
  });

  it.each([
    [' admin', 'view', 'team'],
    ['admin ', 'view', 'team'],
    ['admin', 'view\n', 'team'],
  ])('denies access for inputs with trailing/leading whitespace', (role, action, resource) => {
    // @ts-expect-error - bypassing TS to test whitespace handling at runtime
    expect(canUser(role, action, resource)).toBe(false);
  });
});

describe('Strictness: Exhaustive Negative Space', () => {
  const ALL_ROLES: Role[] = ['admin', 'maintainer', 'viewer'];
  const ALL_RESOURCES: Resource[] = ['team', 'package'];
  const ALL_ACTIONS: Action[] = [
    'view',
    'edit',
    'delete',
    'publish',
    'deprecate',
    'manage_members',
  ];

  const expectedGrants: Record<Role, Record<Resource, Action[]>> = {
    admin: {
      team: ['view', 'edit', 'delete', 'manage_members'],
      package: ['view', 'delete', 'publish', 'deprecate', 'manage_members'],
    },
    maintainer: {
      team: ['view', 'edit', 'manage_members'],
      package: ['view', 'publish', 'deprecate', 'manage_members'],
    },
    viewer: {
      team: ['view'],
      package: ['view'],
    },
  };

  const deniedCombinations = ALL_ROLES.flatMap((role) =>
    ALL_RESOURCES.flatMap((resource) =>
      ALL_ACTIONS.filter((action) => !expectedGrants[role][resource].includes(action)).map(
        (action) => [role, action, resource] as const,
      ),
    ),
  );

  it.each(deniedCombinations)('strictly denies %s to %s on %s', (role, action, resource) => {
    expect(canUser(role, action, resource)).toBe(false);
  });
});
