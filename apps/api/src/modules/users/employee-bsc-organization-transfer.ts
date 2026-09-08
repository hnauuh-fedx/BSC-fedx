import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BscReviewerResolver,
  BscReviewAssignment,
  BscReviewStage,
  DIRECTOR_REVIEW_PERMISSIONS,
} from '../bsc-reviewers/bsc-reviewer-resolver';

type Transaction = Prisma.TransactionClient;

export interface EmployeeOrganizationTarget {
  departmentId: string;
  positionId: string;
  directManagerId: string | null;
}

export interface EmployeeBscTransferInput extends EmployeeOrganizationTarget {
  employeeId: string;
  actorId: string;
  reason: string;
  source: 'USER_UPDATE' | 'RELEASE_BACKFILL';
}

export interface EmployeeBscTransferResult {
  transferredBscIds: string[];
}

function approvalAssignment(reviewers: BscReviewAssignment[]) {
  const manager = reviewers.find((reviewer) => reviewer.role === 'MANAGER');
  return manager
    ? { approverId: manager.id, approverRole: 'MANAGER' as const }
    : { approverId: null, approverRole: 'DIRECTOR' as const };
}

async function resolveAssignment(
  db: Transaction,
  resolver: BscReviewerResolver,
  employeeId: string,
  departmentId: string,
  stage: BscReviewStage,
  permission: string | readonly string[],
) {
  return approvalAssignment(await resolver.resolveRequiredReviewers(db, {
    ownerId: employeeId,
    departmentId,
    stage,
    permission,
  }));
}

/**
 * Reconciles only BSCs in OPEN cycles. Historical LOCKED/CLOSED cycles retain
 * their organizational snapshot for reporting and payroll history.
 */
export async function transferOpenEmployeeBsc(
  db: Transaction,
  resolver: BscReviewerResolver,
  input: EmployeeBscTransferInput,
): Promise<EmployeeBscTransferResult> {
  const managerMismatch: Prisma.employee_bscWhereInput = input.directManagerId === null
    ? { direct_manager_id: { not: null } }
    : { OR: [{ direct_manager_id: null }, { direct_manager_id: { not: input.directManagerId } }] };
  const bscs = await db.employee_bsc.findMany({
    where: {
      employee_id: input.employeeId,
      bsc_cycles: { status: 'OPEN' },
      OR: [
        { department_id: { not: input.departmentId } },
        { position_id: { not: input.positionId } },
        managerMismatch,
      ],
    },
    select: {
      id: true,
      cycle_id: true,
      department_id: true,
      position_id: true,
      direct_manager_id: true,
      plan_status: true,
      evaluation_status: true,
      bsc_approval_steps: {
        where: { status: 'PENDING' },
        select: { id: true, stage: true, approver_id: true, approver_role: true },
      },
      bsc_unlock_requests: {
        where: { status: 'PENDING' },
        select: { id: true, stage: true, reviewer_id: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  const transferredBscIds: string[] = [];
  for (const bsc of bscs) {
    // Lock the cycle row so it cannot become LOCKED/CLOSED while this BSC is
    // being rebound. Organization/routing metadata may move; approved KPI,
    // score and stage data remain untouched.
    const openCycle = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM bsc_cycles
      WHERE id = ${bsc.cycle_id}::uuid AND status = 'OPEN'
      FOR SHARE
    `);
    if (openCycle.length !== 1) {
      throw new ConflictException({
        code: 'BSC_ORGANIZATION_TRANSFER_CONFLICT',
        message: 'Kỳ BSC đã thay đổi trạng thái trong lúc điều chuyển.',
      });
    }

    const stageAssignments = new Map<BscReviewStage, Awaited<ReturnType<typeof resolveAssignment>>>();
    const stages = new Set<BscReviewStage>();
    for (const step of bsc.bsc_approval_steps) {
      if (step.stage === 'PLAN' || step.stage === 'EVALUATION') stages.add(step.stage);
    }
    for (const request of bsc.bsc_unlock_requests) {
      if (request.stage === 'PLAN' || request.stage === 'EVALUATION') stages.add(request.stage);
    }
    for (const stage of stages) {
      const hasPendingApproval = bsc.bsc_approval_steps.some((step) => step.stage === stage);
      stageAssignments.set(stage, await resolveAssignment(
        db,
        resolver,
        input.employeeId,
        input.departmentId,
        stage,
        hasPendingApproval ? DIRECTOR_REVIEW_PERMISSIONS[stage] : DIRECTOR_REVIEW_PERMISSIONS.REOPEN,
      ));
    }

    const now = new Date();
    const changed = await db.employee_bsc.updateMany({
      where: {
        id: bsc.id,
        bsc_cycles: { status: 'OPEN' },
        department_id: bsc.department_id,
        position_id: bsc.position_id,
        direct_manager_id: bsc.direct_manager_id,
      },
      data: {
        department_id: input.departmentId,
        position_id: input.positionId,
        direct_manager_id: input.directManagerId,
        updated_at: now,
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException({
        code: 'BSC_ORGANIZATION_TRANSFER_CONFLICT',
        message: 'BSC vừa được điều chuyển bởi một yêu cầu khác.',
      });
    }

    for (const step of bsc.bsc_approval_steps) {
      if (step.stage !== 'PLAN' && step.stage !== 'EVALUATION') continue;
      const assignment = stageAssignments.get(step.stage);
      if (!assignment) continue;
      const reassigned = await db.bsc_approval_steps.updateMany({
        where: {
          id: step.id,
          status: 'PENDING',
          approver_id: step.approver_id,
          approver_role: step.approver_role,
        },
        data: {
          approver_id: assignment.approverId,
          approver_role: assignment.approverRole,
          decision_source: 'PRIMARY_ROUTE',
        },
      });
      if (reassigned.count !== 1) {
        throw new ConflictException({
          code: 'BSC_ORGANIZATION_TRANSFER_CONFLICT',
          message: 'Bước duyệt vừa được xử lý trong lúc điều chuyển.',
        });
      }
    }
    for (const request of bsc.bsc_unlock_requests) {
      if (request.stage !== 'PLAN' && request.stage !== 'EVALUATION') continue;
      const assignment = stageAssignments.get(request.stage);
      if (!assignment) continue;
      const reassigned = await db.bsc_unlock_requests.updateMany({
        where: {
          id: request.id,
          status: 'PENDING',
          reviewer_id: request.reviewer_id,
        },
        data: { reviewer_id: assignment.approverId, decision_source: 'PRIMARY_ROUTE' },
      });
      if (reassigned.count !== 1) {
        throw new ConflictException({
          code: 'BSC_ORGANIZATION_TRANSFER_CONFLICT',
          message: 'Yêu cầu mở lại vừa được xử lý trong lúc điều chuyển.',
        });
      }
    }

    const newApprovalSteps = bsc.bsc_approval_steps.map((step) => {
      const assignment = stageAssignments.get(step.stage as BscReviewStage);
      return assignment ? {
        ...step,
        approver_id: assignment.approverId,
        approver_role: assignment.approverRole,
        decision_source: 'PRIMARY_ROUTE',
      } : step;
    });
    const newReopenRequests = bsc.bsc_unlock_requests.map((request) => {
      const assignment = stageAssignments.get(request.stage as BscReviewStage);
      return assignment ? {
        ...request,
        reviewer_id: assignment.approverId,
        decision_source: 'PRIMARY_ROUTE',
      } : request;
    });

    await db.audit_logs.create({ data: {
      user_id: input.actorId,
      module: 'employee-bsc',
      entity_type: 'employee_bsc',
      entity_id: bsc.id,
      action: 'BSC_ORGANIZATION_TRANSFERRED',
      old_data: {
        employeeId: input.employeeId,
        cycleId: bsc.cycle_id,
        departmentId: bsc.department_id,
        positionId: bsc.position_id,
        directManagerId: bsc.direct_manager_id,
        pendingApprovalSteps: bsc.bsc_approval_steps,
        pendingReopenRequests: bsc.bsc_unlock_requests,
      } as Prisma.InputJsonValue,
      new_data: {
        employeeId: input.employeeId,
        cycleId: bsc.cycle_id,
        departmentId: input.departmentId,
        positionId: input.positionId,
        directManagerId: input.directManagerId,
        pendingApprovalSteps: newApprovalSteps,
        pendingReopenRequests: newReopenRequests,
        reason: input.reason,
        source: input.source,
        transferredAt: now.toISOString(),
      } as Prisma.InputJsonValue,
    } });
    transferredBscIds.push(bsc.id);
  }
  return { transferredBscIds };
}
