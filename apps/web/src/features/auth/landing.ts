import { ADMINISTRATION_PERMISSIONS } from '../organization/administration-navigation';

export const OWN_BSC_PERMISSIONS = [
  'bsc.view.own',
] as const;

export const MANAGEMENT_REPORT_PERMISSIONS = [
  'bsc.statistics.unit',
  'bsc.statistics.organization',
] as const;

export const REVIEW_QUEUE_PERMISSIONS = [
  'bsc.view.subordinate',
  'bsc.approve.subordinate',
  'bsc.return.subordinate',
  'bsc.plan.approve.subordinate',
  'bsc.plan.return.subordinate',
  'bsc.evaluation.approve.subordinate',
  'bsc.evaluation.return.subordinate',
] as const;

export const MANAGEMENT_SCOPE_VIEW_PERMISSIONS = [
  'bsc.view.unit',
  'bsc.view.organization',
] as const;

export const MANAGEMENT_QUEUE_PERMISSIONS = [
  ...REVIEW_QUEUE_PERMISSIONS,
] as const;

export const MANAGEMENT_OVERVIEW_PERMISSIONS = [
  ...MANAGEMENT_SCOPE_VIEW_PERMISSIONS,
  ...MANAGEMENT_REPORT_PERMISSIONS,
  ...MANAGEMENT_QUEUE_PERMISSIONS,
  'bsc.reopen.subordinate',
] as const;

export const REPORT_PERMISSIONS = [
  'bsc.statistics.personal',
  'bsc.statistics.unit',
  'bsc.statistics.organization',
] as const;

export const hasAnyWorkspacePermission = (
  permissions: readonly string[],
  required: readonly string[],
): boolean => required.some((permission) => permissions.includes(permission));

/** Chooses the default workspace solely from permissions; role labels never grant access. */
export function resolveLandingPath(permissions: readonly string[]): string {
  if (hasAnyWorkspacePermission(permissions, OWN_BSC_PERMISSIONS)) return '/employee-bsc';
  if (hasAnyWorkspacePermission(permissions, MANAGEMENT_OVERVIEW_PERMISSIONS)) {
    return '/management/bsc-overview';
  }
  if (permissions.includes('bsc.statistics.personal')) return '/dashboard';
  if (hasAnyWorkspacePermission(permissions, ADMINISTRATION_PERMISSIONS)) return '/management';
  return '/forbidden';
}

const pathMatches = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Frontend route eligibility for restoring a protected URL after login.
 * Backend authorization remains authoritative for ownership and data scope.
 */
export function canAccessWorkspacePath(pathname: string, permissions: readonly string[]): boolean {
  if (pathname === '/dashboard' || pathname === '/reports/bsc') {
    return hasAnyWorkspacePermission(permissions, REPORT_PERMISSIONS);
  }
  if (pathname === '/management/bsc-overview') {
    return hasAnyWorkspacePermission(permissions, MANAGEMENT_OVERVIEW_PERMISSIONS);
  }
  if (pathname === '/management/bsc-reviews') {
    return hasAnyWorkspacePermission(permissions, REVIEW_QUEUE_PERMISSIONS);
  }
  if (pathname === '/management/bsc-reopen-requests') {
    return permissions.includes('bsc.reopen.subordinate');
  }
  if (pathname === '/employee-bsc/new') return permissions.includes('bsc.create.own');
  if (/^\/employee-bsc\/[^/]+\/edit$/.test(pathname)) return permissions.includes('bsc.edit.own');
  if (/^\/employee-bsc\/[^/]+$/.test(pathname)) {
    return hasAnyWorkspacePermission(permissions, [
      'bsc.view.own',
      'bsc.view.subordinate',
      'bsc.view.unit',
      'bsc.view.organization',
    ]);
  }
  if (pathname === '/employee-bsc') return permissions.includes('bsc.view.own');
  if (pathname === '/management/organization') {
    return hasAnyWorkspacePermission(permissions, ['user.view', 'department.view', 'position.view']);
  }
  if (pathname === '/management/users/new') {
    return permissions.includes('user.create') && permissions.includes('permission.assign');
  }
  if (/^\/management\/users\/[^/]+\/edit$/.test(pathname)) {
    return permissions.includes('user.update');
  }
  if (pathMatches(pathname, '/management/users')) return permissions.includes('user.view');
  if (/^\/management\/departments\/[^/]+\/edit$/.test(pathname)) {
    return permissions.includes('department.manage');
  }
  if (pathMatches(pathname, '/management/departments')) return permissions.includes('department.view');
  if (/^\/management\/positions\/[^/]+\/edit$/.test(pathname)) {
    return permissions.includes('position.manage');
  }
  if (pathMatches(pathname, '/management/positions')) return permissions.includes('position.view');
  if (pathname === '/management/bsc-cycles/new') {
    return permissions.includes('bsc.period.manage');
  }
  if (/^\/management\/bsc-cycles\/[^/]+\/edit$/.test(pathname)) {
    return permissions.includes('bsc.period.manage');
  }
  if (pathMatches(pathname, '/management/bsc-cycles')) {
    return hasAnyWorkspacePermission(permissions, ['bsc.period.view', 'bsc.period.manage']);
  }
  if (pathMatches(pathname, '/management/roles')) return permissions.includes('role.view');
  if (pathname === '/management/audit-logs') return permissions.includes('audit.view');
  if (pathname === '/management') {
    return hasAnyWorkspacePermission(permissions, ADMINISTRATION_PERMISSIONS);
  }
  return false;
}

export function resolvePostLoginPath(
  permissions: readonly string[],
  requestedPath?: string,
): string {
  const requestedPathname = requestedPath?.split(/[?#]/, 1)[0];
  if (
    requestedPath
    && requestedPathname
    && canAccessWorkspacePath(requestedPathname, permissions)
  ) return requestedPath;
  return resolveLandingPath(permissions);
}
