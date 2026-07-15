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
  SUBMIT_PLAN_OWN: 'bsc.plan.submit.own',
  APPROVE_PLAN_SUBORDINATE: 'bsc.plan.approve.subordinate',
  RETURN_PLAN_SUBORDINATE: 'bsc.plan.return.subordinate',
  SUBMIT_EVALUATION_OWN: 'bsc.evaluation.submit.own',
  APPROVE_EVALUATION_SUBORDINATE: 'bsc.evaluation.approve.subordinate',
  RETURN_EVALUATION_SUBORDINATE: 'bsc.evaluation.return.subordinate',
  VIEW_PLAN_HISTORY: 'bsc.plan.history.view',
  VIEW_EVALUATION_HISTORY: 'bsc.evaluation.history.view',
  REQUEST_REOPEN: 'bsc.reopen.request',
  REVIEW_REOPEN: 'bsc.reopen.subordinate',
  VIEW_VERSION: 'bsc.version.view',
  DUPLICATE_OWN: 'bsc.duplicate.own',
} as const;

export interface BscAccessResource {
  employee_id: string;
  department_id: string;
  direct_manager_id: string;
  status?: string;
  plan_status: string;
  evaluation_status: string;
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

  assertCanViewVersion(actor: AuthUser, bsc: BscAccessResource): void {
    this.requirePermission(actor, BSC_PERMISSIONS.VIEW_VERSION);
    this.assertCanView(actor, bsc);
  }

  assertCanRequestReopen(actor: AuthUser, bsc: BscAccessResource): void {
    this.requirePermission(actor, BSC_PERMISSIONS.REQUEST_REOPEN);
    if (actor.id !== bsc.employee_id) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
  }

  assertCanReviewReopen(actor: AuthUser, bsc: BscAccessResource, reviewerId: string | null): void {
    this.requirePermission(actor, BSC_PERMISSIONS.REVIEW_REOPEN);
    if (actor.id === bsc.employee_id || actor.id !== reviewerId || actor.id !== bsc.direct_manager_id
      || !this.canAccessBusinessScope(actor, bsc)) this.deny();
  }

  assertCanDuplicateOwn(actor: AuthUser, bsc: BscAccessResource): void {
    this.requirePermission(actor, BSC_PERMISSIONS.DUPLICATE_OWN);
    if (actor.id !== bsc.employee_id) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
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
    this.assertCanEditPlanDefinition(actor, bsc);
  }

  assertCanEditPlanDefinition(actor: AuthUser, bsc: BscAccessResource): void {
    if (!['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status)) this.fieldLocked();
    if (bsc.plan_status === 'REOPENED') {
      if (bsc.employee_id !== actor.id || !actor.permissions.includes(BSC_PERMISSIONS.EDIT_OWN)) this.deny();
      this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
      return;
    }
    if (!actor.permissions.includes(BSC_PERMISSIONS.MANAGE_KPI) || bsc.direct_manager_id !== actor.id || !this.canAccessBusinessScope(actor, bsc)) this.deny();
  }

  assertCanUpdateActual(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertCanEditEvaluationResult(actor, bsc);
  }

  assertCanEditEvaluationResult(actor: AuthUser, bsc: BscAccessResource): void {
    if (bsc.plan_status !== 'APPROVED' || !['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status)) this.fieldLocked();
    const hasOwnEdit = actor.permissions.includes(BSC_PERMISSIONS.EDIT_OWN) || actor.permissions.includes(BSC_PERMISSIONS.UPDATE_ACTUAL);
    if (!hasOwnEdit || bsc.employee_id !== actor.id) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employee_id, departmentId: bsc.department_id });
  }

  canAccessBusinessScope(actor: AuthUser, bsc: BscAccessResource): boolean {
    return this.scope.canAccessGlobal(actor)
      || this.scope.canAccessDepartment(actor, bsc.department_id);
  }

  private assertDraft(bsc: BscAccessResource): void {
    if (bsc.plan_status !== 'DRAFT' || bsc.evaluation_status !== 'NOT_STARTED') this.fieldLocked();
  }

  private assertEditable(bsc: BscAccessResource): void {
    if (!['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status) || bsc.evaluation_status !== 'NOT_STARTED') this.fieldLocked();
  }

  private fieldLocked(): never {
    throw new ForbiddenException({ code: 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE', message: 'Trường này đang bị khóa ở giai đoạn workflow hiện tại.' });
  }

  private requirePermission(actor: AuthUser, permission: string): void {
    if (!actor.permissions.includes(permission)) this.deny();
  }

  private deny(): never {
    throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Bạn không có quyền thao tác với BSC này.' });
  }
}
