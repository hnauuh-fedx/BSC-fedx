import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

export interface ScopedResource { ownerId?: string; userId?: string; departmentId?: string; }

@Injectable()
export class ResourceScopePolicy {
  canAccessGlobal(user: AuthUser): boolean { return user.roles.some((role) => role.scopeType === 'GLOBAL'); }
  canAccessDepartment(user: AuthUser, departmentId: string): boolean { return this.canAccessGlobal(user) || user.roles.some((role) => role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId); }
  canAccessSelf(user: AuthUser, ownerId: string): boolean { return this.canAccessGlobal(user) || user.roles.some((role) => role.scopeType === 'SELF' && user.id === ownerId); }
  assertResourceScope(user: AuthUser, resource: ScopedResource): void {
    const ownerId = resource.ownerId ?? resource.userId;
    const allowed = this.canAccessGlobal(user) || (resource.departmentId !== undefined && this.canAccessDepartment(user, resource.departmentId)) || (ownerId !== undefined && this.canAccessSelf(user, ownerId));
    if (!allowed) throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Bạn không có quyền truy cập phạm vi dữ liệu này.' });
  }
}
