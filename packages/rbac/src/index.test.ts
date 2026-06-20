import type { Role, Action, Resource, Permission } from '.';

import { canUser, canToken } from '.';
import { describe, it, expect } from 'vite-plus/test';

describe('canUser (RBAC)', () => {
  describe('Admin Role', () => {
    it.each([
      ['team', 'view'],
      ['team', 'edit'],
      ['team', 'delete'],
      ['team', 'manage_members'],
      ['package', 'view'],
      ['package', 'edit'],
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
      ['package', 'edit'],
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
  const ALL_RESOURCES: Resource[] = ['team', 'package'];
  const ALL_ACTIONS: Action[] = [
    'view',
    'edit',
    'delete',
    'publish',
    'deprecate',
    'manage_members',
  ];

  describe('Exact scope present', () => {
    const ALL_PERMISSIONS = ALL_RESOURCES.flatMap((resource) =>
      ALL_ACTIONS.map((action) => [resource, action] as [Resource, Action]),
    );

    it.each(ALL_PERMISSIONS)(
      'grants %s:%s when that exact scope is present',
      (resource, action) => {
        expect(canToken([`${resource}:${action}`], action, resource)).toBe(true);
      },
    );

    it('grants a permission present among many scopes', () => {
      const scopes: Permission[] = ['team:view', 'package:publish', 'package:view'];
      expect(canToken(scopes, 'publish', 'package')).toBe(true);
      expect(canToken(scopes, 'view', 'team')).toBe(true);
    });
  });

  describe('Scope absent', () => {
    const scopes: Permission[] = ['team:view', 'package:publish', 'package:view'];

    it('denies when the permission is not in scopes', () => {
      expect(canToken(scopes, 'delete', 'package')).toBe(false);
      expect(canToken(scopes, 'manage_members', 'team')).toBe(false);
    });

    it('denies when resource matches but action differs', () => {
      expect(canToken(scopes, 'edit', 'team')).toBe(false);
    });

    it('denies for empty scopes', () => {
      expect(canToken([], 'view', 'team')).toBe(false);
    });
  });

  describe('Exhaustive grant/deny matrix', () => {
    const granted: Permission[] = ['package:publish', 'package:view', 'team:view'];

    const allPairs = ALL_RESOURCES.flatMap((resource) =>
      ALL_ACTIONS.map((action) => [resource, action] as [Resource, Action]),
    );

    it.each(allPairs)('canToken(%s:%s) equals exact membership', (resource, action) => {
      const expected = granted.includes(`${resource}:${action}`);
      expect(canToken(granted, action, resource)).toBe(expected);
    });
  });

  describe('No substring / false-positive matches', () => {
    it('denies a longer ARRAY scope containing the target as a substring', () => {
      expect(canToken(['package:view_all'], 'view', 'package')).toBe(false);
      expect(canToken(['package:publish_all'], 'publish', 'package')).toBe(false);
      expect(canToken(['myteam:view'], 'view', 'team')).toBe(false);
    });

    it('denies when scopes is a STRING containing the target as a substring', () => {
      // @ts-expect-error - scopes typed as array; testing non-array runtime input
      expect(canToken('package:publish_all', 'publish', 'package')).toBe(false);
    });

    it('denies even an exact-match STRING (the contract is array-only)', () => {
      // @ts-expect-error - non-array runtime input
      expect(canToken('package:publish', 'publish', 'package')).toBe(false);
    });
  });

  describe('Runtime Boundary Safety (Bypassing TypeScript)', () => {
    it.each([null, undefined, 123, {}, [], true, NaN])(
      'returns false (never throws) for non-array scopes: %s',
      (invalidScopes) => {
        // @ts-expect-error - intentionally passing non-array runtime input
        expect(canToken(invalidScopes, 'view', 'team')).toBe(false);
      },
    );

    it('returns false for an empty-string scopes', () => {
      // @ts-expect-error - non-array runtime input
      expect(canToken('', 'view', 'team')).toBe(false);
    });
  });

  describe('Strictness: Prototype & Built-in Object Properties', () => {
    const scopes: Permission[] = ['team:view', 'package:publish'];

    it.each(['__proto__', 'constructor', 'hasOwnProperty', 'isPrototypeOf', 'toString', 'valueOf'])(
      'denies when action is a built-in object property: "%s"',
      (maliciousAction) => {
        // @ts-expect-error - bypassing TS to test malicious runtime payloads
        expect(canToken(scopes, maliciousAction, 'team')).toBe(false);
      },
    );

    it.each(['__proto__', 'constructor', 'prototype'])(
      'denies when resource is a built-in object property: "%s"',
      (maliciousResource) => {
        // @ts-expect-error - bypassing TS to test malicious runtime payloads
        expect(canToken(scopes, 'view', maliciousResource)).toBe(false);
      },
    );
  });

  describe('Strictness: Case Sensitivity', () => {
    it('denies improperly-cased stored scopes', () => {
      expect(canToken(['Package:Publish'], 'publish', 'package')).toBe(false);
      expect(canToken(['PACKAGE:PUBLISH'], 'publish', 'package')).toBe(false);
    });

    it('denies improperly-cased action/resource arguments', () => {
      // @ts-expect-error - bypassing TS to test case sensitivity at runtime
      expect(canToken(['package:publish'], 'Publish', 'package')).toBe(false);
      // @ts-expect-error - bypassing TS to test case sensitivity at runtime
      expect(canToken(['package:publish'], 'publish', 'Package')).toBe(false);
    });
  });

  describe('Strictness: Whitespace', () => {
    it.each(['package:publish ', ' package:publish', 'package: publish', 'package:publish\n'])(
      'denies stored scope with stray whitespace: "%s"',
      (scope) => {
        expect(canToken([scope], 'publish', 'package')).toBe(false);
      },
    );
  });

  describe('Strictness: resource:action ordering', () => {
    it('denies reversed action:resource ordering', () => {
      expect(canToken(['view:team'], 'view', 'team')).toBe(false);
      expect(canToken(['publish:package'], 'publish', 'package')).toBe(false);
    });
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
      package: ['view', 'edit', 'delete', 'publish', 'deprecate', 'manage_members'],
    },
    maintainer: {
      team: ['view', 'edit', 'manage_members'],
      package: ['view', 'edit', 'publish', 'deprecate', 'manage_members'],
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
