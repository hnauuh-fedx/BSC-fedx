import { ForbiddenException, Injectable } from '@nestjs/common';
import { ResourceScopePolicy } from '../../../common/policies/resource-scope.policy';
import { AuthUser } from '../../../common/types/auth-user.type';

export const BSC_PERMISSIONS = {
  CREATE_OWN: 'bsc.create.own',
  VIEW_OWN: 'bsc.view.own',
  EDIT_OWN: 'bsc.edit.own',
  DELETE_OWN: 'bsc.delete.own',
  VIEW_SUBORDINATE: 'bsc.view.subordinate',
  VIEW_UNIT: 'bsc.view.unit',
  MANAGE_KPI: 'bsc.kpi.manage.subordinate',
  UPDATE_ACTUAL: 'bsc.actual.update.own',
  SUBMIT_OWN: 'bsc.submit.own',
  APPROVE_SUBORDINATE: 'bsc.approve.subordinate',
  RETURN_SUBORDINATE: 'bsc.return.subordinate',
} as const;

export interface BscAccessResource {
  employee_id: string;
  department_id: string;
  direct_manager_id: string;
  status: string;
}

@Injectable()
export class BscAccessPolicy {
  constructor(private readonly scope: ResourceScopePolicy) {}

  assertCanCreateOwn(actor: AuthUser): void {
    this.requirePermission(actor, BSC_PERMISSIONS.CREATE_OWN);
    const roleCodes = new Set(actor.roles.map((role) => role.code));
    if (roleCodes.has('DIRECTOR')) {
      throw new ForbiddenException({ code: 'BSC_DIRECTOR_NOT_ELIGIBLE', message: 'Giám đốc không có BSC cá nhân.' });
    }
    if (roleCodes.has('ADMIN')) {
      throw new ForbiddenException({ code: 'BSC_OWNER_NOT_ELIGIBLE', message: 'Vai trò quản trị không có BSC cá nhân.' });
    }
  }

  assertCanView(actor: AuthUser, bsc: BscAccessResource): void {
    if (bsc.employee_id === actor.id && actor.permissions.includes(BSC_PERMISSIONS.VIEW_OWN)) {
      this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
      return;
    }
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_SUBORDINATE) && bsc.direct_manager_id === actor.id && this.canAccessBusinessScope(actor, bsc)) return;
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_UNIT) && this.canAccessBusinessScope(actor, bsc)) return;
    this.deny();
  }

  assertCanUpdateOwn(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertEditable(bsc);
    if (bsc.employee_id !== actor.id || !actor.permissions.includes(BSC_PERMISSIONS.EDIT_OWN)) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
  }

  assertCanDeleteOwn(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertDraft(bsc);
    if (bsc.employee_id !== actor.id || !actor.permissions.includes(BSC_PERMISSIONS.DELETE_OWN)) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
  }

  assertCanManageKpi(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertEditable(bsc);
    if (!actor.permissions.includes(BSC_PERMISSIONS.MANAGE_KPI) || bsc.direct_manager_id !== actor.id || !this.canAccessBusinessScope(actor, bsc)) this.deny();
  }

  assertCanUpdateActual(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertEditable(bsc);
    const hasOwnEdit = actor.permissions.includes(BSC_PERMISSIONS.EDIT_OWN) || actor.permissions.includes(BSC_PERMISSIONS.UPDATE_ACTUAL);
    if (!hasOwnEdit || bsc.employee_id !== actor.id) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
  }

  canAccessBusinessScope(actor: AuthUser, bsc: BscAccessResource): boolean {
    return this.scope.canAccessGlobal(actor)
      || this.scope.canAccessDepartment(actor, bsc.department_id);
  }

  private assertDraft(bsc: BscAccessResource): void {
    if (bsc.status !== 'DRAFT') {
      throw new ForbiddenException({ code: 'BSC_NOT_DRAFT', message: 'Chỉ BSC nháp mới được chỉnh sửa.' });
    }
  }

  private assertEditable(bsc: BscAccessResource): void {
    if (!['DRAFT', 'RETURNED'].includes(bsc.status)) {
      throw new ForbiddenException({ code: 'BSC_NOT_DRAFT', message: 'Chỉ BSC nháp hoặc bị trả lại mới được chỉnh sửa.' });
    }
  }

  private requirePermission(actor: AuthUser, permission: string): void {
    if (!actor.permissions.includes(permission)) this.deny();
  }

  private deny(): never {
    throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Bạn không có quyền thao tác với BSC này.' });
  }
}
