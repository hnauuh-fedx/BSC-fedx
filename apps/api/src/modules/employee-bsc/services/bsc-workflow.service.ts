import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ResourceScopePolicy } from '../../../common/policies/resource-scope.policy';
import { AuthUser } from '../../../common/types/auth-user.type';
import { BSC_PERMISSIONS } from '../policies/bsc-access.policy';
import { BscScoringResult } from './bsc-scoring.service';

export type BscWorkflowAction = 'SUBMIT' | 'APPROVE' | 'RETURN';
export type BscWorkflowStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED';

export interface WorkflowBscContext {
  employeeId: string;
  directManagerId: string;
  departmentId: string;
  status: string;
  cycleStatus: string;
  submissionDeadline: Date;
  ownerActive: boolean;
  ownerOrganizationActive: boolean;
  reviewerActive: boolean;
}

const TRANSITIONS: Record<BscWorkflowAction, Partial<Record<BscWorkflowStatus, BscWorkflowStatus>>> = {
  SUBMIT: { DRAFT: 'SUBMITTED', RETURNED: 'SUBMITTED' },
  APPROVE: { SUBMITTED: 'APPROVED' },
  RETURN: { SUBMITTED: 'RETURNED' },
};

@Injectable()
export class BscWorkflowService {
  constructor(private readonly scope: ResourceScopePolicy) {}

  assertTransition(fromStatus: string, action: BscWorkflowAction): BscWorkflowStatus {
    const target = TRANSITIONS[action][fromStatus as BscWorkflowStatus];
    if (!target) {
      throw new ConflictException({
        code: 'BSC_INVALID_TRANSITION',
        message: `Không thể thực hiện ${action} khi BSC đang ở trạng thái ${fromStatus}.`,
      });
    }
    return target;
  }

  assertCanSubmit(
    actor: AuthUser,
    bsc: WorkflowBscContext,
    scoring: BscScoringResult,
    now = new Date(),
  ): void {
    if (!actor.permissions.includes(BSC_PERMISSIONS.SUBMIT_OWN) || actor.id !== bsc.employeeId) this.deny();
    this.scope.assertResourceScope(actor, { ownerId: bsc.employeeId, departmentId: bsc.departmentId });
    this.assertTransition(bsc.status, 'SUBMIT');

    if (bsc.cycleStatus !== 'OPEN') this.badRequest('BSC_CYCLE_NOT_OPEN', 'Kỳ BSC không còn mở.');
    if (bsc.submissionDeadline.getTime() < now.getTime()) {
      this.badRequest('BSC_SUBMISSION_DEADLINE_PASSED', 'Đã quá hạn nộp BSC.');
    }
    if (!bsc.ownerActive) this.badRequest('BSC_OWNER_INACTIVE', 'Chủ sở hữu BSC không còn hoạt động.');
    if (!bsc.ownerOrganizationActive) {
      this.badRequest('BSC_OWNER_ORGANIZATION_INACTIVE', 'Đơn vị hoặc chức danh của chủ sở hữu không còn hoạt động.');
    }
    if (!bsc.reviewerActive) this.badRequest('BSC_APPROVER_REQUIRED', 'Không xác định được quản lý trực tiếp đang hoạt động.');
    if (scoring.items.length === 0) this.badRequest('BSC_SUBMIT_INCOMPLETE', 'BSC phải có ít nhất một KPI.');
    if (scoring.totalWeight !== 100) this.badRequest('BSC_TOTAL_WEIGHT_NOT_100', 'Tổng trọng số KPI phải bằng đúng 100%.');
    if (scoring.items.some((item) => item.reason === 'ACTUAL_NOT_PROVIDED')) {
      this.badRequest('BSC_KPI_ACTUAL_REQUIRED', 'Mọi KPI phải có kết quả thực hiện trước khi nộp.');
    }
    if (scoring.items.some((item) => !item.isScorable)) {
      this.badRequest('BSC_KPI_NOT_SCORABLE', 'Mọi KPI phải sử dụng dữ liệu và phương pháp tính điểm hợp lệ.');
    }
    this.assertScoringComplete(scoring);
  }

  assertCanReview(
    actor: AuthUser,
    bsc: WorkflowBscContext,
    action: 'APPROVE' | 'RETURN',
    reason?: string,
  ): string | null {
    if (actor.id === bsc.employeeId) {
      throw new ForbiddenException({ code: 'BSC_SELF_APPROVAL_FORBIDDEN', message: 'Không thể tự duyệt hoặc trả lại BSC của chính mình.' });
    }
    const permission = action === 'APPROVE'
      ? BSC_PERMISSIONS.APPROVE_SUBORDINATE
      : BSC_PERMISSIONS.RETURN_SUBORDINATE;
    if (!actor.permissions.includes(permission) || actor.id !== bsc.directManagerId) this.deny();
    if (!this.scope.canAccessDepartment(actor, bsc.departmentId)) this.deny();
    if (actor.status !== 'ACTIVE' || !bsc.reviewerActive) {
      this.badRequest('BSC_REVIEWER_INACTIVE', 'Người duyệt không còn hoạt động.');
    }
    if (!bsc.ownerActive) this.badRequest('BSC_OWNER_INACTIVE', 'Chủ sở hữu BSC không còn hoạt động.');
    if (!bsc.ownerOrganizationActive) {
      this.badRequest('BSC_OWNER_ORGANIZATION_INACTIVE', 'Đơn vị hoặc chức danh của chủ sở hữu không còn hoạt động.');
    }
    this.assertTransition(bsc.status, action);
    if (action === 'RETURN') return this.normalizeReturnReason(reason);
    return null;
  }

  normalizeReturnReason(reason?: string): string {
    const normalized = (reason ?? '').trim().replace(/<[^>]*>/g, '').trim();
    if (!normalized) this.badRequest('BSC_RETURN_REASON_REQUIRED', 'Lý do trả lại là bắt buộc.');
    return normalized;
  }

  assertScoringComplete(scoring: BscScoringResult): void {
    if (!scoring.isComplete || scoring.totalWeight !== 100 || scoring.items.length === 0 || scoring.items.some((item) => !item.isScorable)) {
      this.badRequest('BSC_SUBMIT_INCOMPLETE', 'Điểm BSC không còn hoàn chỉnh để xử lý workflow.');
    }
  }

  private deny(): never {
    throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Bạn không có quyền thực hiện thao tác workflow này.' });
  }

  private badRequest(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
