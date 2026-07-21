import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ResourceScopePolicy } from '../../../common/policies/resource-scope.policy';
import { AuthUser } from '../../../common/types/auth-user.type';
import { BSC_PERMISSIONS } from '../policies/bsc-access.policy';
import { BscScoringResult } from './bsc-scoring.service';
import { BscCyclePolicy, CycleTiming } from '../../bsc-cycles/bsc-cycle.policy';

export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
export type EvaluationStatus = 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REOPENED';
export type PlanAction = 'SUBMIT_PLAN' | 'APPROVE_PLAN' | 'RETURN_PLAN';
export type EvaluationAction = 'SUBMIT_EVALUATION' | 'APPROVE_EVALUATION' | 'RETURN_EVALUATION';

export interface WorkflowBscContext {
  employeeId: string;
  directManagerId: string;
  departmentId: string;
  planStatus: string;
  evaluationStatus: string;
  cycleStatus: string;
  ownerActive: boolean;
  ownerOrganizationActive: boolean;
  reviewerActive: boolean;
}

export interface PlanDefinitionValidation {
  items: Array<{
    kpiName: string;
    targetValue: unknown | null;
    targetText: string | null;
    weight: number;
    calculationMethod: string;
  }>;
}

const PLAN_TRANSITIONS: Record<PlanAction, Partial<Record<PlanStatus, PlanStatus>>> = {
  SUBMIT_PLAN: { DRAFT: 'SUBMITTED', RETURNED: 'SUBMITTED', REOPENED: 'SUBMITTED' },
  APPROVE_PLAN: { SUBMITTED: 'APPROVED' },
  RETURN_PLAN: { SUBMITTED: 'RETURNED' },
};
const EVALUATION_TRANSITIONS: Record<EvaluationAction, Partial<Record<EvaluationStatus, EvaluationStatus>>> = {
  SUBMIT_EVALUATION: { DRAFT: 'SUBMITTED', RETURNED: 'SUBMITTED', REOPENED: 'SUBMITTED' },
  APPROVE_EVALUATION: { SUBMITTED: 'APPROVED' },
  RETURN_EVALUATION: { SUBMITTED: 'RETURNED' },
};
const SUPPORTED_METHODS = new Set(['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY']);

@Injectable()
export class BscWorkflowService {
  constructor(private readonly scope: ResourceScopePolicy, private readonly cyclePolicy: BscCyclePolicy) {}

  assertPlanTransition(fromStatus: string, action: PlanAction): PlanStatus {
    const target = PLAN_TRANSITIONS[action][fromStatus as PlanStatus];
    if (!target) this.conflict('BSC_PLAN_INVALID_TRANSITION', `Không thể thực hiện ${action} khi kế hoạch ở trạng thái ${fromStatus}.`);
    return target;
  }

  assertEvaluationTransition(fromStatus: string, action: EvaluationAction): EvaluationStatus {
    const target = EVALUATION_TRANSITIONS[action][fromStatus as EvaluationStatus];
    if (!target) this.conflict('BSC_EVALUATION_INVALID_TRANSITION', `Không thể thực hiện ${action} khi đánh giá ở trạng thái ${fromStatus}.`);
    return target;
  }

  assertCanSubmitPlan(actor: AuthUser, bsc: WorkflowBscContext, definition: PlanDefinitionValidation): void {
    this.assertOwner(actor, bsc, BSC_PERMISSIONS.SUBMIT_PLAN_OWN);
    this.assertPlanTransition(bsc.planStatus, 'SUBMIT_PLAN');
    this.cyclePolicy.assertCycleAllowsPlanWork(this.cycleTiming(bsc));
    this.assertCommonActiveContext(bsc);
    this.assertPlanDefinitionComplete(definition);
  }

  assertPlanDefinitionComplete(definition: PlanDefinitionValidation): void {
    if (definition.items.length === 0) this.badRequest('BSC_PLAN_INCOMPLETE', 'BSC phải có ít nhất một KPI.');
    const totalWeight = definition.items.reduce((sum, item) => sum + Number(item.weight), 0);
    if (Math.abs(totalWeight - 100) > 0.000001) this.badRequest('BSC_PLAN_TOTAL_WEIGHT_NOT_100', 'Tổng trọng số KPI phải bằng đúng 100%.');
    if (definition.items.some((item) => !item.kpiName.trim()
      || (item.targetValue === null && !(item.targetText ?? '').trim())
      || !Number.isFinite(Number(item.weight)) || Number(item.weight) < 0
      || !SUPPORTED_METHODS.has(item.calculationMethod))) {
      this.badRequest('BSC_PLAN_INCOMPLETE', 'Định nghĩa KPI chưa đầy đủ hoặc dùng phương pháp tính không được hỗ trợ.');
    }
  }

  assertEvaluationScoringComplete(scoring: BscScoringResult): void {
    if (scoring.items.some((item) => item.reason === 'ACTUAL_NOT_PROVIDED')) {
      this.badRequest('BSC_EVALUATION_ACTUAL_REQUIRED', 'Mọi KPI phải có kết quả thực hiện trước khi xử lý đánh giá.');
    }
    if (!scoring.isComplete || scoring.totalWeight !== 100 || scoring.items.length === 0) {
      this.badRequest('BSC_EVALUATION_INCOMPLETE', 'Đánh giá BSC chưa hoàn chỉnh.');
    }
    if (scoring.items.some((item) => !item.isScorable)) this.badRequest('BSC_EVALUATION_NOT_SCORABLE', 'Có KPI không thể tính điểm.');
  }

  assertCanSubmitEvaluation(actor: AuthUser, bsc: WorkflowBscContext, scoring: BscScoringResult): void {
    this.assertOwner(actor, bsc, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN);
    if (bsc.planStatus !== 'APPROVED') this.badRequest('BSC_EVALUATION_NOT_AVAILABLE', 'Chỉ được đánh giá sau khi kế hoạch được duyệt.');
    this.assertEvaluationTransition(bsc.evaluationStatus, 'SUBMIT_EVALUATION');
    this.cyclePolicy.assertCycleAllowsEvaluationSubmit(this.cycleTiming(bsc));
    this.assertCommonActiveContext(bsc);
    this.assertEvaluationScoringComplete(scoring);
  }

  assertCanReviewPlan(actor: AuthUser, bsc: WorkflowBscContext, action: 'APPROVE_PLAN' | 'RETURN_PLAN', reason?: string): string | null {
    this.assertReviewer(actor, bsc, action === 'APPROVE_PLAN' ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE);
    this.assertPlanTransition(bsc.planStatus, action);
    this.cyclePolicy.assertCycleAllowsReview(this.cycleTiming(bsc));
    return action === 'RETURN_PLAN' ? this.normalizeReturnReason(reason, 'BSC_PLAN_RETURN_REASON_REQUIRED') : null;
  }

  assertCanReviewEvaluation(actor: AuthUser, bsc: WorkflowBscContext, action: 'APPROVE_EVALUATION' | 'RETURN_EVALUATION', reason?: string): string | null {
    if (bsc.planStatus !== 'APPROVED') this.badRequest('BSC_EVALUATION_NOT_AVAILABLE', 'Kế hoạch chưa được duyệt.');
    this.assertReviewer(actor, bsc, action === 'APPROVE_EVALUATION' ? BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE);
    this.assertEvaluationTransition(bsc.evaluationStatus, action);
    this.cyclePolicy.assertCycleAllowsReview(this.cycleTiming(bsc));
    return action === 'RETURN_EVALUATION' ? this.normalizeReturnReason(reason, 'BSC_EVALUATION_RETURN_REASON_REQUIRED') : null;
  }

  private assertOwner(actor: AuthUser, bsc: WorkflowBscContext, permission: string): void {
    if (!actor.permissions.includes(permission) || actor.id !== bsc.employeeId) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employeeId, departmentId: bsc.departmentId });
  }

  private assertReviewer(actor: AuthUser, bsc: WorkflowBscContext, permission: string): void {
    if (actor.id === bsc.employeeId) throw new ForbiddenException({ code: 'BSC_SELF_APPROVAL_FORBIDDEN', message: 'Không thể tự duyệt hoặc trả lại BSC của chính mình.' });
    const canReviewAsDirector = actor.roles.some((role) => role.code === 'DIRECTOR'
      && role.permissions?.includes(permission)
      && (role.scopeType === 'GLOBAL' || (role.scopeType === 'DEPARTMENT' && role.scopeId === bsc.departmentId)));
    const canReviewAsManager = actor.id === bsc.directManagerId && this.scope.canAccessDepartment(actor, bsc.departmentId);
    if (!actor.permissions.includes(permission) || (!canReviewAsDirector && !canReviewAsManager)) this.deny();
    if (actor.status !== 'ACTIVE' || (!canReviewAsDirector && !bsc.reviewerActive)) this.badRequest('BSC_REVIEWER_INACTIVE', 'Người duyệt không còn hoạt động.');
    if (!bsc.ownerActive) this.badRequest('BSC_OWNER_INACTIVE', 'Chủ sở hữu BSC không còn hoạt động.');
    if (!bsc.ownerOrganizationActive) this.badRequest('BSC_OWNER_ORGANIZATION_INACTIVE', 'Đơn vị hoặc chức danh của chủ sở hữu không còn hoạt động.');
  }

  private assertCommonActiveContext(bsc: WorkflowBscContext): void {
    if (!bsc.ownerActive) this.badRequest('BSC_OWNER_INACTIVE', 'Chủ sở hữu BSC không còn hoạt động.');
    if (!bsc.ownerOrganizationActive) this.badRequest('BSC_OWNER_ORGANIZATION_INACTIVE', 'Đơn vị hoặc chức danh của chủ sở hữu không còn hoạt động.');
    if (!bsc.reviewerActive) this.badRequest('BSC_APPROVER_REQUIRED', 'Không xác định được quản lý trực tiếp đang hoạt động.');
  }

  private cycleTiming(bsc: WorkflowBscContext): CycleTiming {
    return { status: bsc.cycleStatus };
  }

  private normalizeReturnReason(reason: string | undefined, code: string): string {
    const normalized = (reason ?? '').trim().replace(/<[^>]*>/g, '').trim();
    if (!normalized) this.badRequest(code, 'Lý do trả lại là bắt buộc.');
    return normalized;
  }
  private deny(): never { throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Bạn không có quyền thực hiện thao tác workflow này.' }); }
  private badRequest(code: string, message: string): never { throw new BadRequestException({ code, message }); }
  private conflict(code: string, message: string): never { throw new ConflictException({ code, message }); }
}
