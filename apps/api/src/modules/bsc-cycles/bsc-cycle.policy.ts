import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user.type';

export type BscCycleStatus = 'DRAFT' | 'OPEN' | 'LOCKED' | 'CLOSED';
export type BscCycleType = 'MONTH' | 'QUARTER' | 'YEAR';
export type BscCycleBusinessAction =
  | 'CREATE_BSC'
  | 'EDIT_PLAN'
  | 'SUBMIT_PLAN'
  | 'EDIT_EVALUATION'
  | 'SUBMIT_EVALUATION'
  | 'DUPLICATE_TARGET';

export const BSC_CYCLE_PERMISSIONS = {
  VIEW: 'bsc.period.view',
  MANAGE: 'bsc.period.manage',
} as const;

export interface CycleTiming {
  status: string;
}

const CONFIRMED_TRANSITIONS = new Set(['DRAFT:OPEN', 'OPEN:LOCKED', 'LOCKED:OPEN', 'OPEN:CLOSED', 'LOCKED:CLOSED']);

@Injectable()
export class BscCyclePolicy {
  assertCanManageCycle(actor: AuthUser, permission = BSC_CYCLE_PERMISSIONS.MANAGE): void {
    const allowed = actor.roles.some((role) => role.scopeType === 'GLOBAL'
      && (role.permissions?.includes(permission) || role.permissions?.includes(BSC_CYCLE_PERMISSIONS.MANAGE)));
    if (!allowed) throw new ForbiddenException({ code: 'BSC_CYCLE_ACCESS_DENIED', message: 'Bạn không có quyền quản lý kỳ BSC.' });
  }

  assertCanTransitionCycle(actor: AuthUser, from: string, to: BscCycleStatus): void {
    this.assertCanManageCycle(actor);
    if (!this.isStatus(from) || !CONFIRMED_TRANSITIONS.has(`${from}:${to}`)) {
      throw new ConflictException({
        code: 'BSC_CYCLE_INVALID_TRANSITION',
        message: `Không thể chuyển kỳ BSC từ ${from} sang ${to}.`,
      });
    }
  }

  assertCycleAllowsPlanWork(cycle: CycleTiming): void {
    this.assertOpen(cycle.status);
  }

  assertCycleAllowsEvaluationEdit(cycle: CycleTiming): void {
    this.assertOpen(cycle.status);
  }

  assertCycleAllowsEvaluationSubmit(cycle: CycleTiming): void {
    this.assertOpen(cycle.status);
  }

  assertCycleAllowsDuplicate(cycle: CycleTiming): void {
    this.assertOpen(cycle.status);
  }

  assertCycleAllowsReview(cycle: CycleTiming): void {
    if (cycle.status !== 'OPEN' && cycle.status !== 'LOCKED') {
      this.deny('BSC_CYCLE_NOT_OPEN', 'Kỳ BSC không ở trạng thái cho phép xử lý duyệt.');
    }
  }

  assertBusinessAction(cycle: CycleTiming, action: BscCycleBusinessAction): void {
    if (action === 'EDIT_EVALUATION') return this.assertCycleAllowsEvaluationEdit(cycle);
    if (action === 'SUBMIT_EVALUATION') return this.assertCycleAllowsEvaluationSubmit(cycle);
    if (action === 'DUPLICATE_TARGET') return this.assertCycleAllowsDuplicate(cycle);
    return this.assertCycleAllowsPlanWork(cycle);
  }

  private assertOpen(status: string): void {
    if (status === 'LOCKED') this.deny('BSC_CYCLE_LOCKED', 'Kỳ BSC đang bị khóa.');
    if (status === 'CLOSED') this.deny('BSC_CYCLE_CLOSED', 'Kỳ BSC đã đóng.');
    if (status !== 'OPEN') this.deny('BSC_CYCLE_NOT_OPEN', 'Kỳ BSC chưa mở.');
  }

  private isStatus(value: string): value is BscCycleStatus {
    return ['DRAFT', 'OPEN', 'LOCKED', 'CLOSED'].includes(value);
  }

  private deny(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
