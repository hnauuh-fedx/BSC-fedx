import type { AuthUser } from './types/auth.types';

export const hasPermission = (user: AuthUser | null, permission: string) => user?.permissions.includes(permission) ?? false;
export const hasAllPermissions = (user: AuthUser | null, permissions: string[]) => permissions.every((permission) => hasPermission(user, permission));
export const hasAnyPermission = (user: AuthUser | null, permissions: string[]) => permissions.some((permission) => hasPermission(user, permission));
export const hasScope = (user: AuthUser | null, scopeType: AuthUser['roles'][number]['scopeType'], scopeId?: string) => user?.roles.some((role) => role.scopeType === 'GLOBAL' || (role.scopeType === scopeType && (scopeType === 'SELF' || role.scopeId === scopeId))) ?? false;
