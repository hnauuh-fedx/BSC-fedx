import { useAuthContext } from '../../../app/store/auth-store';
import { hasAllPermissions, hasAnyPermission, hasPermission, hasScope } from '../permissions';
export function usePermissions() { const { state } = useAuthContext(); return { hasPermission: (p: string) => hasPermission(state.user, p), hasAllPermissions: (p: string[]) => hasAllPermissions(state.user, p), hasAnyPermission: (p: string[]) => hasAnyPermission(state.user, p), hasScope: (type: 'GLOBAL' | 'DEPARTMENT' | 'SELF', id?: string) => hasScope(state.user, type, id) }; }
