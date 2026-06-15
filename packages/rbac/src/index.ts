export type Resource = 'team' | 'package';

export type Role = 'admin' | 'viewer' | 'maintainer';
export type Action = 'view' | 'edit' | 'delete' | 'publish' | 'deprecate' | 'manage_members';

export type Permission = `${Resource}:${Action}`;

const resourceRolePermissions: Record<
  Resource,
  Partial<Record<Role, Partial<Record<Action, boolean>>>>
> = {
  team: {
    admin: { view: true, edit: true, delete: true, manage_members: true },
    maintainer: { edit: true, view: true, manage_members: true },
    viewer: { view: true },
  },
  package: {
    admin: {
      view: true,
      edit: true,
      delete: true,
      publish: true,
      deprecate: true,
      manage_members: true,
    },
    maintainer: {
      view: true,
      edit: true,
      publish: true,
      deprecate: true,
      manage_members: true,
    },
    viewer: { view: true },
  },
};

export function canUser(role: Role, action: Action, resource: Resource): boolean {
  return resourceRolePermissions[resource]?.[role]?.[action] === true;
}

export function canToken(scopes: readonly string[], action: Action, resource: Resource): boolean {
  return Array.isArray(scopes) && scopes.includes(`${resource}:${action}`);
}
