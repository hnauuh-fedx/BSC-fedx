import React from 'react';
import { useAuthContext } from '../../../app/store/auth-store';
import { hasAllPermissions, hasAnyPermission, hasPermission } from '../permissions';

export function PermissionGate({ permission, allOf, anyOf, children, fallback = null }: React.PropsWithChildren<{ permission?: string; allOf?: string[]; anyOf?: string[]; fallback?: React.ReactNode }>) {
  const { state } = useAuthContext();
  const allowed = permission ? hasPermission(state.user, permission) : allOf ? hasAllPermissions(state.user, allOf) : anyOf ? hasAnyPermission(state.user, anyOf) : true;
  return <>{allowed ? children : fallback}</>;
}
