import type { AuthUser } from './types/auth.types';

export const hasPermission = (user: AuthUser | null, permission: string) => user?.permissions.includes(permission) ?? false;
export const hasAllPermissions = (user: AuthUser | null, permissions: string[]) => permissions.every((permission) => hasPermission(user, permission));
export const hasAnyPermission = (user: AuthUser | null, permissions: string[]) => permissions.some((permission) => hasPermission(user, permission));
export const hasScope = (user: AuthUser | null, scopeType: AuthUser['roles'][number]['scopeType'], scopeId?: string) => user?.roles.some((role) => role.scopeType === 'GLOBAL' || (role.scopeType === scopeType && (scopeType === 'SELF' || role.scopeId === scopeId))) ?? false;

const isEmployeeBscReviewerRole = (user: AuthUser, role: AuthUser['roles'][number], departmentId?: string) =>
  (role.code === 'DIRECTOR' && role.scopeType === 'GLOBAL')
  || (user.isEmployeeBscDepartmentReviewer === true && role.code === 'MANAGER'
    && role.scopeType === 'DEPARTMENT' && (!departmentId || role.scopeId === departmentId));

export const employeeBscReviewerPermissions = (user: AuthUser | null, departmentId?: string) => new Set(
  user?.roles.filter((role) => isEmployeeBscReviewerRole(user, role, departmentId))
    .flatMap((role) => role.permissions ?? []) ?? [],
);

export const hasEmployeeBscReviewerPermission = (user: AuthUser | null, permission: string, departmentId?: string) =>
  employeeBscReviewerPermissions(user, departmentId).has(permission);

export const hasGlobalDirectorReviewPermission = (user: AuthUser | null, permission: string) => user?.roles.some(
  (role) => role.code === 'DIRECTOR' && role.scopeType === 'GLOBAL' && role.permissions?.includes(permission),
) ?? false;
