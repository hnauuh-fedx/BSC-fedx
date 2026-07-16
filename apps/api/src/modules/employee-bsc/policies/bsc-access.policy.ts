import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/types/auth-user.type';
import { PrismaService } from '../../../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  listWhere(actor: AuthUser, now = new Date()): Prisma.employee_bscWhereInput {
    const clauses: Prisma.employee_bscWhereInput[] = [];
    if (this.hasScopedPermission(actor, BSC_PERMISSIONS.VIEW_OWN, actor.id, actor.departmentId)) clauses.push({ employee_id: actor.id });
    const subordinateScope = this.businessScopeWhere(actor, BSC_PERMISSIONS.VIEW_SUBORDINATE);
    if (subordinateScope) clauses.push({ AND: [subordinateScope, this.activeManagerWhere(actor.id, now)] });
    const unitScope = this.businessScopeWhere(actor, BSC_PERMISSIONS.VIEW_UNIT);
    if (unitScope) clauses.push(unitScope);
    if (!clauses.length) this.deny();
    return { AND: [{ OR: clauses }, this.activeOwnerOrganizationWhere()] };
  }

  pendingReviewWhere(actor: AuthUser, stage: 'PLAN' | 'EVALUATION', now = new Date()): Prisma.employee_bscWhereInput {
    const permissions = stage === 'PLAN'
      ? [BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE]
      : [BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE];
    const scope = this.businessScopeWhereAny(actor, permissions);
    if (!scope) this.deny();
    return { AND: [scope, this.activeManagerWhere(actor.id, now), this.activeOwnerOrganizationWhere(), stage === 'PLAN'
      ? { plan_status: 'SUBMITTED' }
      : { plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' }] };
  }

  pendingReopenWhere(actor: AuthUser, now = new Date()): Prisma.bsc_unlock_requestsWhereInput {
    const scope = this.businessScopeWhere(actor, BSC_PERMISSIONS.REVIEW_REOPEN);
    if (!scope) this.deny();
    return { reviewer_id: actor.id, employee_bsc: { is: { AND: [scope, this.activeManagerWhere(actor.id, now), this.activeOwnerOrganizationWhere()] } } };
  }

  canFilterDepartment(actor: AuthUser, departmentId: string): boolean {
    return actor.roles.some((role) => [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT]
      .some((permission) => this.roleGrants(role, permission))
      && (role.scopeType === 'GLOBAL'
        || (role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId)
        || (role.scopeType === 'SELF' && actor.departmentId === departmentId)));
  }

  assertCanCreateOwn(actor: AuthUser): void {
    if (!this.hasScopedPermission(actor, BSC_PERMISSIONS.CREATE_OWN, actor.id, actor.departmentId)) this.deny();
    const roleCodes = new Set(actor.roles.map((role) => role.code));
    if (roleCodes.has('DIRECTOR')) {
      throw new ForbiddenException({ code: 'BSC_DIRECTOR_NOT_ELIGIBLE', message: 'Giám đốc không có BSC cá nhân.' });
    }
    if (roleCodes.has('ADMIN')) {
      throw new ForbiddenException({ code: 'BSC_OWNER_NOT_ELIGIBLE', message: 'Vai trò quản trị không có BSC cá nhân.' });
    }
  }

  async assertCanView(actor: AuthUser, bsc: BscAccessResource): Promise<void> {
    await this.assertActiveResource(bsc);
    if (bsc.employee_id === actor.id && this.hasScopedPermission(actor, BSC_PERMISSIONS.VIEW_OWN, bsc.employee_id, bsc.department_id)) {
      return;
    }
    if (this.hasBusinessPermission(actor, BSC_PERMISSIONS.VIEW_SUBORDINATE, bsc.department_id)
      && await this.hasActiveManagerRelationship(actor.id, bsc.employee_id)) return;
    if (this.hasBusinessPermission(actor, BSC_PERMISSIONS.VIEW_UNIT, bsc.department_id)) return;
    this.deny();
  }

  async assertActiveResource(bsc: BscAccessResource): Promise<void> {
    if (!await this.hasActiveOwnerOrganization(bsc.employee_id, bsc.department_id)) this.deny();
  }

  async assertCanViewVersion(actor: AuthUser, bsc: BscAccessResource): Promise<void> {
    if (!this.hasScopedPermission(actor, BSC_PERMISSIONS.VIEW_VERSION, bsc.employee_id, bsc.department_id)) this.deny();
    await this.assertCanView(actor, bsc);
  }

  canViewStageHistory(actor: AuthUser, bsc: BscAccessResource, permission: string): boolean {
    return this.hasScopedPermission(actor, permission, bsc.employee_id, bsc.department_id);
  }

  assertCanSubmitOwn(actor: AuthUser, bsc: BscAccessResource, permission: string): void {
    if (actor.id !== bsc.employee_id || !this.hasScopedPermission(actor, permission, bsc.employee_id, bsc.department_id)) this.deny();
  }

  assertCanRequestReopen(actor: AuthUser, bsc: BscAccessResource): void {
    if (actor.id !== bsc.employee_id
      || !this.hasScopedPermission(actor, BSC_PERMISSIONS.REQUEST_REOPEN, bsc.employee_id, bsc.department_id)) this.deny();
  }

  async assertCanReviewReopen(
    actor: AuthUser,
    bsc: BscAccessResource,
    reviewerId: string | null,
    allowStaleConflict = false,
  ): Promise<void> {
    await this.assertActiveResource(bsc);
    if (actor.id === bsc.employee_id || actor.id !== reviewerId
      || !this.hasBusinessPermission(actor, BSC_PERMISSIONS.REVIEW_REOPEN, bsc.department_id)) this.deny();
    if (await this.hasActiveManagerRelationship(actor.id, bsc.employee_id)) return;
    if (!allowStaleConflict) this.deny();
    const owner = await this.prisma.users.findUnique({ where: { id: bsc.employee_id }, select: { direct_manager_id: true } });
    if (!owner || owner.direct_manager_id === actor.id) this.deny();
  }

  async assertCanReview(actor: AuthUser, bsc: BscAccessResource, permission: string): Promise<void> {
    if (actor.id === bsc.employee_id) {
      throw new ForbiddenException({ code: 'BSC_SELF_APPROVAL_FORBIDDEN', message: 'Không thể tự duyệt hoặc trả lại BSC của chính mình.' });
    }
    if (!this.hasBusinessPermission(actor, permission, bsc.department_id)
      || !await this.hasActiveManagerRelationship(actor.id, bsc.employee_id)) this.deny();
  }

  async assertHasActiveReviewer(bsc: BscAccessResource): Promise<void> {
    if (!await this.hasActiveManagerRelationship(bsc.direct_manager_id, bsc.employee_id)) {
      throw new ForbiddenException({ code: 'BSC_ACTIVE_REVIEWER_REQUIRED', message: 'Không xác định được người duyệt trực tiếp đang có hiệu lực.' });
    }
  }

  assertCanDuplicateOwn(actor: AuthUser, bsc: BscAccessResource): void {
    if (actor.id !== bsc.employee_id
      || !this.hasScopedPermission(actor, BSC_PERMISSIONS.DUPLICATE_OWN, bsc.employee_id, bsc.department_id)) this.deny();
  }

  assertCanUpdateOwn(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertEditable(bsc);
    if (bsc.employee_id !== actor.id
      || !this.hasScopedPermission(actor, BSC_PERMISSIONS.EDIT_OWN, bsc.employee_id, bsc.department_id)) this.deny();
  }

  assertCanDeleteOwn(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertDraft(bsc);
    if (bsc.employee_id !== actor.id
      || !this.hasScopedPermission(actor, BSC_PERMISSIONS.DELETE_OWN, bsc.employee_id, bsc.department_id)) this.deny();
  }

  async assertCanManageKpi(actor: AuthUser, bsc: BscAccessResource): Promise<void> {
    await this.assertCanEditPlanDefinition(actor, bsc);
  }

  async assertCanEditPlanDefinition(actor: AuthUser, bsc: BscAccessResource): Promise<void> {
    if (!['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status)) this.fieldLocked();
    if (bsc.plan_status === 'REOPENED') {
      if (bsc.employee_id !== actor.id
        || !this.hasScopedPermission(actor, BSC_PERMISSIONS.EDIT_OWN, bsc.employee_id, bsc.department_id)) this.deny();
      return;
    }
    if (!this.hasBusinessPermission(actor, BSC_PERMISSIONS.MANAGE_KPI, bsc.department_id)
      || !await this.hasActiveManagerRelationship(actor.id, bsc.employee_id)) this.deny();
  }

  assertCanUpdateActual(actor: AuthUser, bsc: BscAccessResource): void {
    this.assertCanEditEvaluationResult(actor, bsc);
  }

  assertCanEditEvaluationResult(actor: AuthUser, bsc: BscAccessResource): void {
    if (bsc.plan_status !== 'APPROVED' || !['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status)) this.fieldLocked();
    const hasOwnEdit = this.hasScopedPermission(actor, BSC_PERMISSIONS.EDIT_OWN, bsc.employee_id, bsc.department_id)
      || this.hasScopedPermission(actor, BSC_PERMISSIONS.UPDATE_ACTUAL, bsc.employee_id, bsc.department_id);
    if (!hasOwnEdit || bsc.employee_id !== actor.id) this.deny();
  }

  private businessScopeWhere(actor: AuthUser, permission: string): Prisma.employee_bscWhereInput | null {
    return this.businessScopeWhereAny(actor, [permission]);
  }

  private businessScopeWhereAny(actor: AuthUser, permissions: readonly string[]): Prisma.employee_bscWhereInput | null {
    const assignments = actor.roles.filter((role) => permissions.some((permission) => this.roleGrants(role, permission)));
    if (assignments.some((role) => role.scopeType === 'GLOBAL')) return {};
    const departmentIds = assignments.filter((role) => role.scopeType === 'DEPARTMENT' && role.scopeId).map((role) => role.scopeId!);
    return departmentIds.length ? { department_id: { in: [...new Set(departmentIds)] } } : null;
  }

  private activeManagerWhere(managerId: string, now: Date): Prisma.employee_bscWhereInput {
    const date = this.dateOnly(now);
    return { users_employee_bsc_employee_idTousers: { manager_relationships_manager_relationships_employee_idTousers: { some: {
      manager_id: managerId, is_primary: true, start_date: { lte: date }, OR: [{ end_date: null }, { end_date: { gte: date } }],
      users_manager_relationships_employee_idTousers: { direct_manager_id: managerId },
      users_manager_relationships_manager_idTousers: { status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' } },
    } } } };
  }

  private activeOwnerOrganizationWhere(): Prisma.employee_bscWhereInput {
    return { users_employee_bsc_employee_idTousers: { status: 'ACTIVE', deleted_at: null }, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' } };
  }

  private async hasActiveManagerRelationship(managerId: string, employeeId: string, now = new Date()): Promise<boolean> {
    const date = this.dateOnly(now);
    return (await this.prisma.manager_relationships.count({ where: {
      manager_id: managerId, employee_id: employeeId, is_primary: true, start_date: { lte: date },
      OR: [{ end_date: null }, { end_date: { gte: date } }],
      users_manager_relationships_employee_idTousers: { direct_manager_id: managerId, status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' } },
      users_manager_relationships_manager_idTousers: { status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' } },
    } })) > 0;
  }

  private async hasActiveOwnerOrganization(employeeId: string, departmentId: string): Promise<boolean> {
    return (await this.prisma.users.count({ where: {
      id: employeeId,
      department_id: departmentId,
      status: 'ACTIVE',
      deleted_at: null,
      departments: { status: 'ACTIVE' },
      positions: { status: 'ACTIVE' },
    } })) > 0;
  }

  private hasBusinessPermission(actor: AuthUser, permission: string, departmentId: string): boolean {
    return actor.roles.some((role) => this.roleGrants(role, permission)
      && (role.scopeType === 'GLOBAL' || (role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId)));
  }

  private hasScopedPermission(actor: AuthUser, permission: string, ownerId: string, departmentId: string): boolean {
    return actor.roles.some((role) => this.roleGrants(role, permission) && (role.scopeType === 'GLOBAL'
      || (role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId)
      || (role.scopeType === 'SELF' && actor.id === ownerId)));
  }

  private roleGrants(role: AuthUser['roles'][number], permission: string): boolean {
    return role.permissions ? role.permissions.includes(permission) : false;
  }

  private dateOnly(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
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

  private deny(): never {
    throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Bạn không có quyền thao tác với BSC này.' });
  }
}
