export type AuthScopeType = 'GLOBAL' | 'DEPARTMENT' | 'SELF';

export interface AuthRoleScope {
  code: string;
  scopeType: AuthScopeType;
  scopeId: string | null;
  permissions?: readonly string[];
}

export interface AuthUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  departmentId: string;
  status: string;
  roles: AuthRoleScope[];
  permissions: string[];
}
