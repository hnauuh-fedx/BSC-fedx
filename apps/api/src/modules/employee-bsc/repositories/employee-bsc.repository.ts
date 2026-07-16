import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuthUser } from '../../../common/types/auth-user.type';
import { AuditRequestMetadata } from '../employee-bsc.types';
import { CreateBscItemDto, UpdateBscActualDto, UpdateBscItemDto } from '../dto/bsc-item.dto';
import { QueryEmployeeBscDto } from '../dto/query-employee-bsc.dto';
import { QueryReopenRequestDto } from '../dto/reopen-bsc.dto';
import { assertTotalWeight } from '../validators/bsc-item.validator';
import { BscScoringResult } from '../services/bsc-scoring.service';
import { BscCycleBusinessAction, BscCyclePolicy, CycleTiming } from '../../bsc-cycles/bsc-cycle.policy';

const bscAccessSelect = {
  id: true,
  employee_id: true,
  department_id: true,
  direct_manager_id: true,
  status: true,
  plan_status: true,
  evaluation_status: true,
} satisfies Prisma.employee_bscSelect;

const bscDetailSelect = {
  ...bscAccessSelect,
  bsc_code: true,
  cycle_id: true,
  position_id: true,
  source_bsc_id: true,
  source_bsc_version_id: true,
  employee_comment: true,
  manager_comment: true,
  submitted_at: true,
  approved_at: true,
  approved_by: true,
  plan_submitted_at: true,
  plan_approved_at: true,
  plan_approved_by: true,
  evaluation_submitted_at: true,
  evaluation_approved_at: true,
  evaluation_approved_by: true,
  locked_at: true,
  final_score: true,
  final_grade: true,
  created_at: true,
  updated_at: true,
  bsc_cycles: { select: {
    id: true, code: true, name: true, cycle_type: true, year: true, month: true, quarter: true, status: true,
    start_date: true, end_date: true, submission_deadline: true,
  } },
  users_employee_bsc_employee_idTousers: { select: { id: true, employee_code: true, full_name: true, email: true } },
  departments: { select: { id: true, code: true, name: true } },
  positions: { select: { id: true, code: true, name: true, level: true } },
  users_employee_bsc_direct_manager_idTousers: { select: { id: true, employee_code: true, full_name: true, email: true } },
  employee_bsc_items: { orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] },
  bsc_status_histories: {
    select: {
      id: true, stage: true, from_status: true, to_status: true, action: true, comment: true,
      changed_by: true, changed_at: true,
      users: { select: { id: true, employee_code: true, full_name: true } },
    },
    orderBy: { changed_at: 'asc' },
  },
} satisfies Prisma.employee_bscSelect;

const reopenRequestSelect = {
  id: true,
  employee_bsc_id: true,
  stage: true,
  requested_by: true,
  reviewer_id: true,
  request_reason: true,
  requested_at: true,
  status: true,
  reviewed_by: true,
  review_comment: true,
  reviewed_at: true,
  allowed_fields: true,
  source_version_id: true,
  resulting_version_id: true,
  users_bsc_unlock_requests_requested_byTousers: { select: { id: true, employee_code: true, full_name: true } },
  users_bsc_unlock_requests_reviewer_idTousers: { select: { id: true, employee_code: true, full_name: true } },
  employee_bsc: { select: {
    ...bscAccessSelect,
    bsc_code: true,
    cycle_id: true,
    bsc_cycles: { select: { id: true, name: true, year: true, month: true } },
    users_employee_bsc_employee_idTousers: { select: { id: true, employee_code: true, full_name: true } },
    departments: { select: { id: true, code: true, name: true } },
  } },
} satisfies Prisma.bsc_unlock_requestsSelect;

type Transaction = Prisma.TransactionClient;

@Injectable()
export class EmployeeBscRepository {
  constructor(private readonly prisma: PrismaService, private readonly cyclePolicy: BscCyclePolicy) {}

  findEmployeeContext(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        employee_code: true,
        department_id: true,
        position_id: true,
        direct_manager_id: true,
        status: true,
        deleted_at: true,
        departments: { select: { status: true } },
        positions: { select: { status: true } },
        users: { select: { id: true, status: true, deleted_at: true } },
      },
    });
  }

  findCycle(id: string) {
    return this.prisma.bsc_cycles.findUnique({ where: { id } });
  }

  async findAll(where: Prisma.employee_bscWhereInput, query: QueryEmployeeBscDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee_bsc.findMany({
        where,
        select: {
          ...bscAccessSelect,
          bsc_code: true,
          cycle_id: true,
          position_id: true,
          employee_comment: true,
          submitted_at: true,
          approved_at: true,
          plan_submitted_at: true,
          plan_approved_at: true,
          evaluation_submitted_at: true,
          evaluation_approved_at: true,
          final_score: true,
          final_grade: true,
          created_at: true,
          updated_at: true,
          bsc_cycles: { select: {
            id: true, code: true, name: true, year: true, month: true, status: true,
            submission_deadline: true,
          } },
          users_employee_bsc_employee_idTousers: { select: { id: true, employee_code: true, full_name: true, email: true } },
          departments: { select: { id: true, code: true, name: true } },
          users_employee_bsc_direct_manager_idTousers: { select: { id: true, employee_code: true, full_name: true } },
          _count: { select: { employee_bsc_items: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.employee_bsc.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }

  async findReviewFilterOptions(where: Prisma.employee_bscWhereInput) {
    const rows = await this.prisma.employee_bsc.findMany({
      where,
      select: {
        bsc_cycles: { select: { id: true, name: true, status: true } },
        departments: { select: { id: true, code: true, name: true } },
      },
      distinct: ['cycle_id', 'department_id'],
    });
    return {
      cycles: Array.from(new Map(rows.map((row) => [row.bsc_cycles.id, row.bsc_cycles])).values()),
      departments: Array.from(new Map(rows.map((row) => [row.departments.id, row.departments])).values()),
    };
  }

  findById(id: string) {
    return this.prisma.employee_bsc.findUnique({ where: { id }, select: bscDetailSelect });
  }

  findItemById(id: string) {
    return this.prisma.employee_bsc_items.findUnique({ where: { id } });
  }

  submitPlanWorkflow(
    actor: AuthUser,
    id: string,
    metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => void,
  ) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      await this.requireActiveReviewer(db, snapshot.employee_id, snapshot.direct_manager_id);
      validate(snapshot);
      const now = new Date();
      const changed = await db.employee_bsc.updateMany({
        where: { id, plan_status: snapshot.plan_status },
        data: { plan_status: 'SUBMITTED', plan_submitted_at: now, updated_at: now },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: {
        employee_bsc_id: id, stage: 'PLAN', from_status: snapshot.plan_status, to_status: 'SUBMITTED', action: 'SUBMIT_PLAN',
        changed_by: actor.id, changed_at: now, ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
      } });
      await db.bsc_approval_steps.upsert({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: id, stage: 'PLAN', step_order: 1 } },
        create: { employee_bsc_id: id, stage: 'PLAN', step_order: 1, approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING' },
        update: { approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING', comment: null, acted_at: null },
      });
      await this.audit(db, actor, 'BSC_PLAN_SUBMITTED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, stage: 'PLAN', status: snapshot.plan_status },
        { bscId: id, employeeId: snapshot.employee_id, stage: 'PLAN', status: 'SUBMITTED' }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
    });
  }

  reviewPlanWorkflow(
    actor: AuthUser,
    id: string,
    action: 'APPROVE_PLAN' | 'RETURN_PLAN',
    metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => string | null,
  ) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      const reviewerRole = await this.requireActiveReviewer(db, snapshot.employee_id, actor.id);
      const effectiveSnapshot = { ...snapshot, direct_manager_id: actor.id, reviewer_status: 'ACTIVE', reviewer_deleted_at: null,
        reviewer_organization_active: true, reviewer_matches_owner: true, reviewer_role: reviewerRole };
      const reason = validate(effectiveSnapshot);
      const now = new Date();
      const targetStatus = action === 'APPROVE_PLAN' ? 'APPROVED' : 'RETURNED';
      const changed = await db.employee_bsc.updateMany({
        where: { id, plan_status: 'SUBMITTED' },
        data: action === 'APPROVE_PLAN'
          ? {
              plan_status: targetStatus, plan_approved_at: now, plan_approved_by: actor.id,
              direct_manager_id: actor.id,
              evaluation_status: snapshot.evaluation_status === 'NOT_STARTED' ? 'DRAFT' : snapshot.evaluation_status,
              updated_at: now,
            }
          : {
              plan_status: targetStatus, plan_approved_at: null, plan_approved_by: null, evaluation_status: 'NOT_STARTED', updated_at: now,
              direct_manager_id: actor.id,
            },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: {
        employee_bsc_id: id, stage: 'PLAN', from_status: 'SUBMITTED', to_status: targetStatus, action,
        comment: reason, changed_by: actor.id, changed_at: now,
        ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
      } });
      await db.bsc_approval_steps.update({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: id, stage: 'PLAN', step_order: 1 } },
        data: { approver_id: actor.id, approver_role: reviewerRole, status: targetStatus, comment: reason, acted_at: now },
      });
      const review = await db.bsc_reviews.create({ data: {
        employee_bsc_id: id, stage: 'PLAN', reviewer_id: actor.id,
        reviewer_role: reviewerRole,
        review_level: 1, action: action === 'APPROVE_PLAN' ? 'APPROVE' : 'RETURN', score_before: null, score_after: null,
        comment: reason, reviewed_at: now,
      } });
      if (action === 'APPROVE_PLAN') {
        await this.createVersion(db, id, 'PLAN', 'PLAN_APPROVED', actor, metadata, { sourceReviewId: review.id });
      }
      await this.audit(db, actor, action === 'APPROVE_PLAN' ? 'BSC_PLAN_APPROVED' : 'BSC_PLAN_RETURNED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, stage: 'PLAN', status: 'SUBMITTED' },
        { bscId: id, employeeId: snapshot.employee_id, stage: 'PLAN', status: targetStatus, reason }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
    });
  }

  submitEvaluationWorkflow(actor: AuthUser, id: string, metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => BscScoringResult) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      await this.requireActiveReviewer(db, snapshot.employee_id, snapshot.direct_manager_id);
      const scoring = validate(snapshot);
      const now = new Date();
      const changed = await db.employee_bsc.updateMany({
        where: { id, plan_status: 'APPROVED', evaluation_status: snapshot.evaluation_status },
        data: { evaluation_status: 'SUBMITTED', evaluation_submitted_at: now, locked_at: now, updated_at: now },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: { employee_bsc_id: id, stage: 'EVALUATION', from_status: snapshot.evaluation_status,
        to_status: 'SUBMITTED', action: 'SUBMIT_EVALUATION', changed_by: actor.id, changed_at: now,
        ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
      await db.bsc_approval_steps.upsert({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: id, stage: 'EVALUATION', step_order: 1 } },
        create: { employee_bsc_id: id, stage: 'EVALUATION', step_order: 1, approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING' },
        update: { approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING', comment: null, acted_at: null },
      });
      await this.audit(db, actor, 'BSC_EVALUATION_SUBMITTED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, stage: 'EVALUATION', status: snapshot.evaluation_status },
        { bscId: id, employeeId: snapshot.employee_id, stage: 'EVALUATION', status: 'SUBMITTED', previewScore: scoring.totalWeightedScore }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
    });
  }

  reviewEvaluationWorkflow(actor: AuthUser, id: string, action: 'APPROVE_EVALUATION' | 'RETURN_EVALUATION', metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => { scoring: BscScoringResult; reason: string | null }) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      const reviewerRole = await this.requireActiveReviewer(db, snapshot.employee_id, actor.id);
      const effectiveSnapshot = { ...snapshot, direct_manager_id: actor.id, reviewer_status: 'ACTIVE', reviewer_deleted_at: null,
        reviewer_organization_active: true, reviewer_matches_owner: true, reviewer_role: reviewerRole };
      const { scoring, reason } = validate(effectiveSnapshot);
      const now = new Date();
      const approved = action === 'APPROVE_EVALUATION';
      const targetStatus = approved ? 'APPROVED' : 'RETURNED';
      const changed = await db.employee_bsc.updateMany({
        where: { id, plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' },
        data: approved ? {
          evaluation_status: targetStatus, evaluation_approved_at: now, evaluation_approved_by: actor.id, locked_at: now,
          direct_manager_id: actor.id,
          manager_total_score: scoring.canonicalTotalWeightedScore, final_score: scoring.canonicalTotalWeightedScore,
          final_grade: scoring.classification, updated_at: now,
        } : {
          evaluation_status: targetStatus, evaluation_approved_at: null, evaluation_approved_by: null, locked_at: null,
          direct_manager_id: actor.id,
          manager_total_score: null, final_score: null, final_grade: null, updated_at: now,
        },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: { employee_bsc_id: id, stage: 'EVALUATION', from_status: 'SUBMITTED', to_status: targetStatus,
        action, comment: reason, changed_by: actor.id, changed_at: now, ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
      await db.bsc_approval_steps.update({ where: { employee_bsc_id_stage_step_order: { employee_bsc_id: id, stage: 'EVALUATION', step_order: 1 } },
        data: { approver_id: actor.id, approver_role: reviewerRole, status: targetStatus, comment: reason, acted_at: now } });
      const review = await db.bsc_reviews.create({ data: { employee_bsc_id: id, stage: 'EVALUATION', reviewer_id: actor.id, reviewer_role: reviewerRole,
        review_level: 1, action: approved ? 'APPROVE' : 'RETURN', score_before: snapshot.final_score,
        score_after: approved ? scoring.canonicalTotalWeightedScore : null, comment: reason, reviewed_at: now } });
      if (approved) {
        await this.createVersion(db, id, 'EVALUATION', 'EVALUATION_APPROVED', actor, metadata, {
          sourceReviewId: review.id,
          scoring,
        });
      }
      await this.audit(db, actor, approved ? 'BSC_EVALUATION_APPROVED' : 'BSC_EVALUATION_RETURNED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, stage: 'EVALUATION', status: 'SUBMITTED' },
        { bscId: id, employeeId: snapshot.employee_id, stage: 'EVALUATION', status: targetStatus, reason,
          ...(approved ? { score: scoring.canonicalTotalWeightedScore.toString(), classification: scoring.classification } : {}) }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
    });
  }

  async findVersions(bscId: string) {
    const versions = await this.prisma.bsc_versions.findMany({
      where: { employee_bsc_id: bscId },
      select: {
        id: true, version_number: true, stage: true, version_type: true, created_at: true,
        source_review_id: true, source_reopen_request_id: true, snapshot: true,
        users: { select: { id: true, employee_code: true, full_name: true } },
      },
      orderBy: { version_number: 'desc' },
    });
    return versions.map((version) => ({
      id: version.id,
      versionNumber: version.version_number,
      stage: version.stage,
      versionType: version.version_type,
      createdAt: version.created_at,
      createdBy: version.users,
      sourceReviewId: version.source_review_id,
      sourceReopenRequestId: version.source_reopen_request_id,
      summary: this.versionSummary(version.snapshot),
    }));
  }

  findVersion(bscId: string, versionId: string) {
    return this.prisma.bsc_versions.findFirst({
      where: { id: versionId, employee_bsc_id: bscId },
      select: {
        id: true, version_number: true, stage: true, version_type: true, snapshot: true, created_at: true,
        source_review_id: true, source_reopen_request_id: true,
        users: { select: { id: true, employee_code: true, full_name: true } },
      },
    });
  }

  createReopenRequest(
    actor: AuthUser,
    bscId: string,
    stage: 'PLAN' | 'EVALUATION',
    reason: string,
    metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => void,
  ) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, bscId);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      validate(snapshot);
      const version = await db.bsc_versions.findFirst({
        where: { employee_bsc_id: bscId, version_type: stage === 'PLAN' ? 'PLAN_APPROVED' : 'EVALUATION_APPROVED' },
        orderBy: { version_number: 'desc' },
        select: { id: true },
      });
      if (!version) throw new ConflictException({
        code: stage === 'PLAN' ? 'BSC_APPROVED_PLAN_VERSION_NOT_FOUND' : 'BSC_VERSION_NOT_FOUND',
        message: 'Không tìm thấy phiên bản đã duyệt để mở lại.',
      });
      const request = await db.bsc_unlock_requests.create({ data: {
        employee_bsc_id: bscId,
        stage,
        requested_by: actor.id,
        reviewer_id: snapshot.direct_manager_id,
        request_reason: reason,
        status: 'PENDING',
        allowed_fields: (stage === 'PLAN'
          ? ['definition']
          : ['actualValue', 'actualText', 'employeeNote']) as Prisma.InputJsonValue,
        source_version_id: version.id,
      }, select: reopenRequestSelect });
      await this.audit(db, actor, stage === 'PLAN' ? 'BSC_PLAN_REOPEN_REQUESTED' : 'BSC_EVALUATION_REOPEN_REQUESTED',
        'bsc_reopen_request', request.id, null, { bscId, stage, reason, reviewerId: snapshot.direct_manager_id, sourceVersionId: version.id }, metadata);
      return request;
    });
  }

  async findReopenRequestsForBsc(bscId: string) {
    return this.prisma.bsc_unlock_requests.findMany({
      where: { employee_bsc_id: bscId }, select: reopenRequestSelect,
      orderBy: [{ requested_at: 'desc' }, { id: 'desc' }],
    });
  }

  async findPendingReopenRequests(access: Prisma.bsc_unlock_requestsWhereInput, query: QueryReopenRequestDto) {
    const where: Prisma.bsc_unlock_requestsWhereInput = {
      AND: [access],
      ...(query.stage ? { stage: query.stage } : {}),
      status: query.status ?? 'PENDING',
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bsc_unlock_requests.findMany({
        where, select: reopenRequestSelect, orderBy: [{ requested_at: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
      this.prisma.bsc_unlock_requests.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }

  findReopenRequest(requestId: string) {
    return this.prisma.bsc_unlock_requests.findUnique({ where: { id: requestId }, select: reopenRequestSelect });
  }

  approveReopenRequest(
    actor: AuthUser,
    requestId: string,
    metadata: AuditRequestMetadata,
    validate: (request: NonNullable<Awaited<ReturnType<EmployeeBscRepository['reopenWorkflowSnapshot']>>>) => void,
  ) {
    return this.serializable(async (db) => {
      const request = await this.reopenWorkflowSnapshot(db, requestId);
      if (!request) throw new NotFoundException({ code: 'BSC_REOPEN_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu mở lại.' });
      validate(request);
      const latestApprovedVersion = await db.bsc_versions.findFirst({
        where: {
          employee_bsc_id: request.employee_bsc_id,
          version_type: request.stage === 'PLAN' ? 'PLAN_APPROVED' : 'EVALUATION_APPROVED',
        },
        orderBy: { version_number: 'desc' },
        select: { id: true },
      });
      if (!latestApprovedVersion || latestApprovedVersion.id !== request.source_version_id) {
        this.reopenConflict('BSC_REOPEN_SOURCE_VERSION_STALE');
      }
      const now = new Date();
      const changed = await db.bsc_unlock_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', reviewed_by: actor.id, review_comment: null, reviewed_at: now },
      });
      if (changed.count !== 1) this.reopenConflict('BSC_REOPEN_REQUEST_NOT_PENDING');
      const version = await this.createVersion(
        db,
        request.employee_bsc_id,
        request.stage === 'PLAN' ? 'FULL' : 'EVALUATION',
        request.stage === 'PLAN' ? 'BEFORE_PLAN_REOPEN' : 'BEFORE_EVALUATION_REOPEN',
        actor,
        metadata,
        { sourceReopenRequestId: request.id },
      );
      await db.bsc_unlock_requests.update({
        where: { id: request.id },
        data: { resulting_version_id: version.id },
      });

      if (request.stage === 'PLAN') {
        await db.bsc_unlock_requests.updateMany({
          where: {
            employee_bsc_id: request.employee_bsc_id,
            stage: 'EVALUATION',
            status: 'PENDING',
            id: { not: request.id },
          },
          data: {
            status: 'EXPIRED',
            reviewed_by: actor.id,
            reviewed_at: now,
            review_comment: 'Yêu cầu hết hiệu lực do kế hoạch BSC đã được mở lại.',
          },
        });
        const bscChanged = await db.employee_bsc.updateMany({
          where: { id: request.employee_bsc_id, plan_status: 'APPROVED', evaluation_status: request.evaluation_status },
          data: {
            plan_status: 'REOPENED', plan_approved_at: null, plan_approved_by: null,
            evaluation_status: 'NOT_STARTED', evaluation_submitted_at: null, evaluation_approved_at: null,
            evaluation_approved_by: null, manager_total_score: null, final_score: null, final_grade: null,
            locked_at: null, updated_at: now,
          },
        });
        if (bscChanged.count !== 1) this.reopenConflict('BSC_REOPEN_WORKFLOW_CONFLICT');
        await db.employee_bsc_items.updateMany({ where: { employee_bsc_id: request.employee_bsc_id }, data: {
          actual_value: null, actual_text: null, employee_note: null, manager_note: null,
          achievement_percent: 0, employee_score: 0, manager_score: null, final_score: null, updated_at: now,
        } });
        await db.bsc_attachments.updateMany({ where: { employee_bsc_id: request.employee_bsc_id, deleted_at: null }, data: { deleted_at: now } });
      } else {
        const bscChanged = await db.employee_bsc.updateMany({
          where: { id: request.employee_bsc_id, plan_status: 'APPROVED', evaluation_status: 'APPROVED' },
          data: {
            evaluation_status: 'REOPENED', evaluation_approved_at: null, evaluation_approved_by: null,
            manager_total_score: null, final_score: null, final_grade: null, locked_at: null, updated_at: now,
          },
        });
        if (bscChanged.count !== 1) this.reopenConflict('BSC_REOPEN_WORKFLOW_CONFLICT');
      }

      await db.bsc_status_histories.create({ data: {
        employee_bsc_id: request.employee_bsc_id, stage: request.stage, from_status: 'APPROVED', to_status: 'REOPENED',
        action: request.stage === 'PLAN' ? 'APPROVE_PLAN_REOPEN' : 'APPROVE_EVALUATION_REOPEN',
        comment: request.request_reason, changed_by: actor.id, changed_at: now,
        ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
      } });
      await this.audit(db, actor, request.stage === 'PLAN' ? 'BSC_PLAN_REOPEN_APPROVED' : 'BSC_EVALUATION_REOPEN_APPROVED',
        'bsc_reopen_request', request.id, { status: 'PENDING' },
        { bscId: request.employee_bsc_id, stage: request.stage, status: 'APPROVED', resultingVersionId: version.id }, metadata);
      return db.bsc_unlock_requests.findUniqueOrThrow({ where: { id: request.id }, select: reopenRequestSelect });
    });
  }

  rejectReopenRequest(
    actor: AuthUser,
    requestId: string,
    reason: string,
    metadata: AuditRequestMetadata,
    validate: (request: NonNullable<Awaited<ReturnType<EmployeeBscRepository['reopenWorkflowSnapshot']>>>) => void,
  ) {
    return this.serializable(async (db) => {
      const request = await this.reopenWorkflowSnapshot(db, requestId);
      if (!request) throw new NotFoundException({ code: 'BSC_REOPEN_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu mở lại.' });
      validate(request);
      const now = new Date();
      const changed = await db.bsc_unlock_requests.updateMany({ where: { id: request.id, status: 'PENDING' }, data: {
        status: 'REJECTED', reviewed_by: actor.id, review_comment: reason, reviewed_at: now,
      } });
      if (changed.count !== 1) this.reopenConflict('BSC_REOPEN_REQUEST_NOT_PENDING');
      await this.audit(db, actor, request.stage === 'PLAN' ? 'BSC_PLAN_REOPEN_REJECTED' : 'BSC_EVALUATION_REOPEN_REJECTED',
        'bsc_reopen_request', request.id, { status: 'PENDING' },
        { bscId: request.employee_bsc_id, stage: request.stage, status: 'REJECTED', reason }, metadata);
      return db.bsc_unlock_requests.findUniqueOrThrow({ where: { id: request.id }, select: reopenRequestSelect });
    });
  }

  async findDuplicateOptions(bscId: string, employeeId: string) {
    const source = await this.prisma.employee_bsc.findUnique({ where: { id: bscId }, select: {
      cycle_id: true,
      bsc_cycles: { select: { start_date: true } },
    } });
    if (!source) return [];
    return this.prisma.bsc_cycles.findMany({
      where: {
        status: 'OPEN', cycle_type: 'MONTH', id: { not: source.cycle_id }, start_date: { gt: source.bsc_cycles.start_date },
        employee_bsc: { none: { employee_id: employeeId } },
      },
      select: { id: true, code: true, name: true, year: true, month: true, status: true, start_date: true },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
    });
  }

  duplicateFromApprovedPlan(actor: AuthUser, sourceBscId: string, targetCycleId: string, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      const source = await db.employee_bsc.findUnique({ where: { id: sourceBscId }, select: {
        id: true, employee_id: true, cycle_id: true,
        bsc_cycles: { select: { start_date: true } },
      } });
      if (!source) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC nguồn.' });
      const [version, targetCycle, owner] = await Promise.all([
        db.bsc_versions.findFirst({ where: { employee_bsc_id: sourceBscId, version_type: 'PLAN_APPROVED' }, orderBy: { version_number: 'desc' } }),
        db.bsc_cycles.findUnique({ where: { id: targetCycleId } }),
        db.users.findUnique({ where: { id: actor.id }, select: {
          id: true, employee_code: true, department_id: true, position_id: true, direct_manager_id: true,
          status: true, deleted_at: true,
          departments: { select: { status: true } }, positions: { select: { status: true } },
          users: {
            select: {
              status: true,
              deleted_at: true,
              departments: { select: { status: true } },
              positions: { select: { status: true } },
            },
          },
        } }),
      ]);
      if (!version) throw new ConflictException({ code: 'BSC_APPROVED_PLAN_VERSION_NOT_FOUND', message: 'BSC nguồn chưa có phiên bản kế hoạch được duyệt.' });
      if (!targetCycle) throw new NotFoundException({ code: 'BSC_DUPLICATE_TARGET_INVALID', message: 'Không tìm thấy kỳ đích.' });
      this.cyclePolicy.assertCycleAllowsDuplicate(this.cycleTiming(targetCycle));
      if (targetCycle.id === source.cycle_id || targetCycle.start_date <= source.bsc_cycles.start_date) {
        throw new BadRequestException({ code: 'BSC_DUPLICATE_TARGET_INVALID', message: 'Kỳ đích phải nằm sau kỳ nguồn.' });
      }
      if (!owner || owner.deleted_at || owner.status !== 'ACTIVE' || owner.departments.status !== 'ACTIVE' || owner.positions.status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'BSC_DUPLICATE_NOT_ALLOWED', message: 'Chủ sở hữu hoặc tổ chức hiện tại không hoạt động.' });
      }
      if (!owner.direct_manager_id || !owner.users || owner.users.status !== 'ACTIVE' || owner.users.deleted_at
        || owner.users.departments.status !== 'ACTIVE' || owner.users.positions.status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'BSC_REOPEN_REVIEWER_REQUIRED', message: 'Không xác định được quản lý trực tiếp hiện tại.' });
      }
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const currentPrimaryRelationship = await db.manager_relationships.findFirst({
        where: {
          employee_id: owner.id,
          manager_id: owner.direct_manager_id,
          is_primary: true,
          start_date: { lte: today },
          OR: [{ end_date: null }, { end_date: { gte: today } }],
        },
        select: { id: true },
      });
      if (!currentPrimaryRelationship) {
        throw new BadRequestException({
          code: 'BSC_REOPEN_REVIEWER_REQUIRED',
          message: 'Không xác định được quan hệ quản lý trực tiếp hiện tại.',
        });
      }
      const snapshot = version.snapshot as Prisma.JsonObject;
      const items = Array.isArray(snapshot.items) ? snapshot.items as Prisma.JsonObject[] : [];
      const totalWeight = items.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
      if (items.length === 0 || Math.abs(totalWeight - 100) > 0.000001) {
        throw new BadRequestException({ code: 'BSC_DUPLICATE_SOURCE_NOT_APPROVED', message: 'Phiên bản kế hoạch nguồn không hợp lệ.' });
      }
      try {
        const duplicated = await db.employee_bsc.create({ data: {
          bsc_code: this.createBscCode(owner.employee_code), cycle_id: targetCycle.id, employee_id: owner.id,
          department_id: owner.department_id, position_id: owner.position_id, direct_manager_id: owner.direct_manager_id,
          source_bsc_id: source.id, source_bsc_version_id: version.id, plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED',
          status: 'DRAFT', created_by: actor.id,
          employee_bsc_items: { create: items.map((item, index) => ({
            kpi_code: String(item.kpiCode ?? `KPI_${index + 1}`).slice(0, 50),
            kpi_name: String(item.kpiName ?? ''), description: this.nullableString(item.description),
            measurement_unit: this.nullableString(item.measurementUnit),
            target_value: item.targetValue === null || item.targetValue === undefined ? null : String(item.targetValue),
            target_text: this.nullableString(item.targetText), weight: String(item.weight),
            calculation_method: String(item.calculationMethod), sort_order: Number(item.sortOrder ?? index),
            assigned_by: owner.direct_manager_id!, actual_value: null, actual_text: null, employee_note: null,
          })) },
        }, select: bscDetailSelect });
        await this.audit(db, actor, 'BSC_DUPLICATED', 'employee_bsc', duplicated.id, null, {
          sourceBscId: source.id, sourceVersionId: version.id, targetCycleId: targetCycle.id,
          employeeId: owner.id, departmentId: owner.department_id, positionId: owner.position_id,
          directManagerId: owner.direct_manager_id,
        }, metadata);
        return duplicated;
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException({ code: 'BSC_DUPLICATE_TARGET_EXISTS', message: 'Đã có BSC trong kỳ đích.' });
        }
        throw error;
      }
    });
  }

  async createDraft(data: {
    actor: AuthUser;
    cycleId: string;
    employeeCode: string;
    departmentId: string;
    positionId: string;
    managerId: string;
    metadata: AuditRequestMetadata;
  }) {
    return this.serializable(async (db) => {
      await this.assertCycleActionInTransaction(db, data.cycleId, 'CREATE_BSC');
      const bsc = await db.employee_bsc.create({
        data: {
          bsc_code: this.createBscCode(data.employeeCode),
          cycle_id: data.cycleId,
          employee_id: data.actor.id,
          department_id: data.departmentId,
          position_id: data.positionId,
          direct_manager_id: data.managerId,
          status: 'DRAFT',
          created_by: data.actor.id,
        },
        select: bscDetailSelect,
      });
      await this.audit(db, data.actor, 'BSC_CREATED', 'employee_bsc', bsc.id, null, {
        bscId: bsc.id,
        cycleId: data.cycleId,
        employeeId: data.actor.id,
        departmentId: data.departmentId,
        positionId: data.positionId,
        directManagerId: data.managerId,
        status: 'DRAFT',
      }, data.metadata);
      return bsc;
    });
  }

  async updateDraftComment(actor: AuthUser, id: string, comment: string | undefined, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertCycleActionForBscInTransaction(db, id, 'EDIT_PLAN');
      const current = await db.employee_bsc.findUniqueOrThrow({ where: { id }, select: { employee_comment: true, plan_status: true } });
      if (!['DRAFT', 'RETURNED', 'REOPENED'].includes(current.plan_status)) throw new ForbiddenException({ code: 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE', message: 'Nội dung BSC đang bị khóa.' });
      const bsc = await db.employee_bsc.update({ where: { id }, data: { employee_comment: comment, updated_at: new Date() }, select: bscDetailSelect });
      await this.audit(db, actor, 'BSC_UPDATED', 'employee_bsc', id, { employeeComment: current.employee_comment }, { employeeComment: bsc.employee_comment }, metadata);
      return bsc;
    });
  }

  async deleteDraft(actor: AuthUser, bsc: { id: string; employee_id: string; cycle_id?: string }, metadata: AuditRequestMetadata) {
    await this.serializable(async (db) => {
      await this.assertCycleActionForBscInTransaction(db, bsc.id, 'EDIT_PLAN');
      const current = await db.employee_bsc.findUniqueOrThrow({ where: { id: bsc.id }, select: { plan_status: true } });
      if (current.plan_status !== 'DRAFT') throw new ForbiddenException({ code: 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE', message: 'Chỉ kế hoạch nháp mới được xóa.' });
      const itemCount = await db.employee_bsc_items.count({ where: { employee_bsc_id: bsc.id } });
      await db.employee_bsc.delete({ where: { id: bsc.id } });
      await this.audit(db, actor, 'BSC_DELETED', 'employee_bsc', bsc.id, { bscId: bsc.id, employeeId: bsc.employee_id, cycleId: bsc.cycle_id, itemCount }, null, metadata);
    });
  }

  createItem(actor: AuthUser, bscId: string, dto: CreateBscItemDto, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertPlanDefinitionEditableInTransaction(db, bscId);
      const aggregate = await db.employee_bsc_items.aggregate({ where: { employee_bsc_id: bscId }, _sum: { weight: true } });
      assertTotalWeight(Number(aggregate._sum.weight ?? 0) + dto.weight);
      const item = await db.employee_bsc_items.create({
        data: {
          employee_bsc_id: bscId,
          kpi_code: dto.kpiCode.trim().toUpperCase(),
          kpi_name: dto.kpiName.trim(),
          description: dto.description?.trim(),
          measurement_unit: dto.measurementUnit?.trim(),
          target_value: dto.targetValue,
          target_text: dto.targetText?.trim(),
          weight: dto.weight,
          calculation_method: dto.calculationMethod,
          assigned_by: actor.id,
          sort_order: dto.sortOrder,
        },
      });
      await this.audit(db, actor, 'BSC_ITEM_CREATED', 'employee_bsc_item', item.id, null, this.itemAudit(item), metadata);
      return item;
    });
  }

  updateItem(actor: AuthUser, bscId: string, itemId: string, dto: UpdateBscItemDto, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertPlanDefinitionEditableInTransaction(db, bscId);
      const old = await this.requireItemInBsc(db, bscId, itemId);
      const weight = dto.weight ?? Number(old.weight);
      const aggregate = await db.employee_bsc_items.aggregate({ where: { employee_bsc_id: bscId, id: { not: itemId } }, _sum: { weight: true } });
      assertTotalWeight(Number(aggregate._sum.weight ?? 0) + weight);
      const item = await db.employee_bsc_items.update({
        where: { id: itemId },
        data: {
          ...(dto.kpiCode !== undefined ? { kpi_code: dto.kpiCode.trim().toUpperCase() } : {}),
          ...(dto.kpiName !== undefined ? { kpi_name: dto.kpiName.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.measurementUnit !== undefined ? { measurement_unit: dto.measurementUnit.trim() } : {}),
          ...(dto.targetValue !== undefined ? { target_value: dto.targetValue } : {}),
          ...(dto.targetText !== undefined ? { target_text: dto.targetText.trim() } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.calculationMethod !== undefined ? { calculation_method: dto.calculationMethod } : {}),
          ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}),
          updated_at: new Date(),
        },
      });
      await this.audit(db, actor, 'BSC_ITEM_UPDATED', 'employee_bsc_item', item.id, this.itemAudit(old), this.itemAudit(item), metadata);
      return item;
    });
  }

  updateActual(actor: AuthUser, bscId: string, itemId: string, dto: UpdateBscActualDto, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertEvaluationResultEditableInTransaction(db, bscId);
      const old = await this.requireItemInBsc(db, bscId, itemId);
      const item = await db.employee_bsc_items.update({
        where: { id: itemId },
        data: {
          ...(dto.actualValue !== undefined ? { actual_value: dto.actualValue } : {}),
          ...(dto.actualText !== undefined ? { actual_text: dto.actualText.trim() } : {}),
          ...(dto.employeeNote !== undefined ? { employee_note: dto.employeeNote.trim() } : {}),
          updated_at: new Date(),
        },
      });
      await this.audit(db, actor, 'BSC_ACTUAL_UPDATED', 'employee_bsc_item', item.id,
        { bscId, actualValue: old.actual_value, actualText: old.actual_text, employeeNote: old.employee_note },
        { bscId, actualValue: item.actual_value, actualText: item.actual_text, employeeNote: item.employee_note }, metadata);
      return item;
    });
  }

  deleteItem(actor: AuthUser, bscId: string, itemId: string, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertPlanDefinitionEditableInTransaction(db, bscId);
      const old = await this.requireItemInBsc(db, bscId, itemId);
      await db.employee_bsc_items.delete({ where: { id: itemId } });
      await this.audit(db, actor, 'BSC_ITEM_DELETED', 'employee_bsc_item', itemId, this.itemAudit(old), null, metadata);
      return { success: true };
    });
  }

  private async createVersion(
    db: Transaction,
    bscId: string,
    stage: 'PLAN' | 'EVALUATION' | 'FULL',
    versionType: 'PLAN_APPROVED' | 'EVALUATION_APPROVED' | 'BEFORE_PLAN_REOPEN' | 'BEFORE_EVALUATION_REOPEN',
    actor: AuthUser,
    metadata: AuditRequestMetadata,
    references: { sourceReviewId?: string; sourceReopenRequestId?: string; scoring?: BscScoringResult },
  ) {
    const source = await db.employee_bsc.findUnique({ where: { id: bscId }, select: {
      id: true, bsc_code: true, cycle_id: true, employee_id: true, department_id: true, position_id: true,
      direct_manager_id: true, plan_status: true, plan_submitted_at: true, plan_approved_at: true, plan_approved_by: true,
      evaluation_status: true, evaluation_submitted_at: true, evaluation_approved_at: true, evaluation_approved_by: true,
      employee_comment: true, manager_comment: true,
      manager_total_score: true, final_score: true, final_grade: true, locked_at: true,
      bsc_cycles: { select: { id: true, code: true, name: true, year: true, month: true, status: true } },
      users_employee_bsc_employee_idTousers: { select: { id: true, employee_code: true, full_name: true } },
      departments: { select: { id: true, code: true, name: true } },
      positions: { select: { id: true, code: true, name: true, level: true } },
      users_employee_bsc_direct_manager_idTousers: { select: { id: true, employee_code: true, full_name: true } },
      employee_bsc_items: { orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] },
      bsc_attachments: {
        where: { deleted_at: null },
        select: {
          id: true, bsc_item_id: true, file_name: true, mime_type: true, file_size: true,
          uploaded_by: true, uploaded_at: true,
        },
        orderBy: [{ uploaded_at: 'asc' }, { id: 'asc' }],
      },
    } });
    if (!source) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
    const latest = await db.bsc_versions.aggregate({ where: { employee_bsc_id: bscId }, _max: { version_number: true } });
    const versionNumber = (latest._max.version_number ?? 0) + 1;
    const approvedEvaluationVersion = versionType.startsWith('BEFORE_') && source.evaluation_status === 'APPROVED'
      ? await db.bsc_versions.findFirst({
          where: { employee_bsc_id: bscId, version_type: 'EVALUATION_APPROVED' },
          orderBy: { version_number: 'desc' },
          select: { id: true, snapshot: true },
        })
      : null;
    const approvedSnapshot = approvedEvaluationVersion?.snapshot
      && typeof approvedEvaluationVersion.snapshot === 'object'
      && !Array.isArray(approvedEvaluationVersion.snapshot)
      ? approvedEvaluationVersion.snapshot as Prisma.JsonObject
      : null;
    const approvedItems = approvedSnapshot && Array.isArray(approvedSnapshot.items)
      ? approvedSnapshot.items.filter((item): item is Prisma.JsonObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
    const approvedScoreByItem = new Map(approvedItems.map((item) => [String(item.id), item]));
    const scoringByItem = new Map(references.scoring?.items.map((item) => [item.itemId, item]) ?? []);
    const definitionItems = source.employee_bsc_items.map((item) => ({
      id: item.id,
      kpiCode: item.kpi_code,
      kpiName: item.kpi_name,
      description: item.description,
      measurementUnit: item.measurement_unit,
      targetValue: item.target_value?.toString() ?? null,
      targetText: item.target_text,
      weight: item.weight.toString(),
      calculationMethod: item.calculation_method,
      sortOrder: item.sort_order,
    }));
    const resultItems = source.employee_bsc_items.map((item) => {
      const score = scoringByItem.get(item.id);
      const approvedScore = approvedScoreByItem.get(item.id);
      return {
        ...definitionItems.find((definition) => definition.id === item.id)!,
        actualValue: item.actual_value?.toString() ?? null,
        actualText: item.actual_text,
        employeeNote: item.employee_note,
        managerNote: item.manager_note,
        persistedAchievementPercent: item.achievement_percent.toString(),
        persistedEmployeeScore: item.employee_score.toString(),
        persistedManagerScore: item.manager_score?.toString() ?? null,
        persistedFinalScore: item.final_score?.toString() ?? null,
        rawAchievementPercentage: score?.rawAchievementPercentage ?? approvedScore?.rawAchievementPercentage ?? null,
        roundedAchievementPercentage: score?.roundedAchievementPercentage ?? approvedScore?.roundedAchievementPercentage ?? null,
        rawWorkScore: score?.rawWorkScore ?? approvedScore?.rawWorkScore ?? null,
        roundedWorkScore: score?.roundedWorkScore ?? approvedScore?.roundedWorkScore ?? null,
        weightedScore: score?.weightedScore ?? approvedScore?.weightedScore ?? null,
      };
    });
    const evidence = source.bsc_attachments.map((attachment) => ({
      id: attachment.id,
      itemId: attachment.bsc_item_id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize: attachment.file_size.toString(),
      uploadedBy: attachment.uploaded_by,
      uploadedAt: attachment.uploaded_at.toISOString(),
    }));
    const latestPlan = stage === 'EVALUATION' || stage === 'FULL'
      ? await db.bsc_versions.findFirst({
          where: { employee_bsc_id: bscId, version_type: 'PLAN_APPROVED' },
          orderBy: { version_number: 'desc' }, select: { id: true, version_number: true },
        })
      : null;
    const snapshot = {
      formatVersion: 1,
      bscId: source.id,
      bscCode: source.bsc_code,
      cycle: source.bsc_cycles,
      employee: source.users_employee_bsc_employee_idTousers,
      department: source.departments,
      position: source.positions,
      reviewer: source.users_employee_bsc_direct_manager_idTousers,
      employeeComment: source.employee_comment,
      managerComment: source.manager_comment,
      planStatus: source.plan_status,
      planSubmittedAt: source.plan_submitted_at?.toISOString() ?? null,
      planApprovedAt: source.plan_approved_at?.toISOString() ?? null,
      planApprovedBy: source.plan_approved_by,
      evaluationStatus: source.evaluation_status,
      evaluationSubmittedAt: source.evaluation_submitted_at?.toISOString() ?? null,
      evaluationApprovedAt: source.evaluation_approved_at?.toISOString() ?? null,
      evaluationApprovedBy: source.evaluation_approved_by,
      planVersionId: latestPlan?.id ?? null,
      planVersionNumber: latestPlan?.version_number ?? null,
      approvedEvaluationVersionId: approvedEvaluationVersion?.id ?? null,
      totalWeight: source.employee_bsc_items.reduce((sum, item) => sum + Number(item.weight), 0),
      items: stage === 'PLAN' ? definitionItems : resultItems,
      evidence,
      managerTotalScore: source.manager_total_score?.toString() ?? null,
      totalScore: references.scoring?.canonicalTotalWeightedScore.toString() ?? source.final_score?.toString() ?? null,
      finalScore: source.final_score?.toString() ?? null,
      finalGrade: source.final_grade,
      lockedAt: source.locked_at?.toISOString() ?? null,
    };
    const version = await db.bsc_versions.create({ data: {
      employee_bsc_id: bscId,
      version_number: versionNumber,
      stage,
      version_type: versionType,
      snapshot: snapshot as Prisma.InputJsonValue,
      created_by: actor.id,
      source_review_id: references.sourceReviewId,
      source_reopen_request_id: references.sourceReopenRequestId,
    } });
    await this.audit(db, actor, 'BSC_VERSION_CREATED', 'bsc_version', version.id, null, {
      bscId, versionNumber, stage, versionType,
      sourceReviewId: references.sourceReviewId ?? null,
      sourceReopenRequestId: references.sourceReopenRequestId ?? null,
    }, metadata);
    return version;
  }

  private reopenWorkflowSnapshot(db: Transaction, requestId: string) {
    return db.bsc_unlock_requests.findUnique({ where: { id: requestId }, select: {
      id: true, employee_bsc_id: true, stage: true, status: true, requested_by: true, reviewer_id: true,
      request_reason: true, source_version_id: true,
      employee_bsc: { select: {
        ...bscAccessSelect,
        cycle_id: true,
        users_employee_bsc_employee_idTousers: { select: { direct_manager_id: true, status: true, deleted_at: true } },
        users_employee_bsc_direct_manager_idTousers: { select: { status: true, deleted_at: true } },
        departments: { select: { status: true } },
        positions: { select: { status: true } },
      } },
    } }).then((request) => request ? ({
      ...request,
      employee_id: request.employee_bsc.employee_id,
      department_id: request.employee_bsc.department_id,
      direct_manager_id: request.employee_bsc.direct_manager_id,
      plan_status: request.employee_bsc.plan_status,
      evaluation_status: request.employee_bsc.evaluation_status,
      owner_current_manager_id: request.employee_bsc.users_employee_bsc_employee_idTousers.direct_manager_id,
      owner_active: request.employee_bsc.users_employee_bsc_employee_idTousers.status === 'ACTIVE'
        && request.employee_bsc.users_employee_bsc_employee_idTousers.deleted_at === null,
      reviewer_active: request.employee_bsc.users_employee_bsc_direct_manager_idTousers.status === 'ACTIVE'
        && request.employee_bsc.users_employee_bsc_direct_manager_idTousers.deleted_at === null,
      organization_active: request.employee_bsc.departments.status === 'ACTIVE' && request.employee_bsc.positions.status === 'ACTIVE',
    }) : null);
  }

  private versionSummary(snapshot: Prisma.JsonValue) {
    const value = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Prisma.JsonObject : {};
    const items = Array.isArray(value.items) ? value.items.length : 0;
    return {
      itemCount: items,
      totalWeight: value.totalWeight ?? null,
      totalScore: value.totalScore ?? value.finalScore ?? null,
      finalGrade: value.finalGrade ?? null,
    };
  }

  private nullableString(value: Prisma.JsonValue | undefined): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  private reopenConflict(code: string): never {
    throw new ConflictException({ code, message: 'Yêu cầu mở lại hoặc workflow vừa được xử lý bởi thao tác khác.' });
  }

  private async serializable<T>(operation: (db: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable transaction retry state');
  }

  private workflowSnapshot(db: Transaction, id: string) {
    return db.employee_bsc.findUnique({ where: { id }, select: {
      id: true, employee_id: true, department_id: true, direct_manager_id: true,
      plan_status: true, evaluation_status: true, final_score: true,
      bsc_cycles: { select: {
        status: true, start_date: true, end_date: true, submission_deadline: true,
      } },
      users_employee_bsc_employee_idTousers: { select: { status: true, deleted_at: true, direct_manager_id: true } },
      users_employee_bsc_direct_manager_idTousers: { select: {
        status: true, deleted_at: true,
        departments: { select: { status: true } }, positions: { select: { status: true } },
        user_roles_user_roles_user_idTousers: {
          where: { OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }], roles: { status: 'ACTIVE' } },
          select: { roles: { select: { code: true } } },
        },
      } },
      departments: { select: { status: true } }, positions: { select: { status: true } },
      employee_bsc_items: { select: { id: true, kpi_name: true, calculation_method: true, target_value: true, target_text: true, actual_value: true, weight: true } },
    } }).then((bsc) => bsc ? ({
      id: bsc.id, employee_id: bsc.employee_id, department_id: bsc.department_id,
      direct_manager_id: bsc.direct_manager_id, plan_status: bsc.plan_status,
      evaluation_status: bsc.evaluation_status, final_score: bsc.final_score,
      cycle_status: bsc.bsc_cycles.status, submission_deadline: bsc.bsc_cycles.submission_deadline,
      start_date: bsc.bsc_cycles.start_date, end_date: bsc.bsc_cycles.end_date,
      owner_status: bsc.users_employee_bsc_employee_idTousers.status,
      owner_deleted_at: bsc.users_employee_bsc_employee_idTousers.deleted_at,
      reviewer_status: bsc.users_employee_bsc_direct_manager_idTousers.status,
      reviewer_deleted_at: bsc.users_employee_bsc_direct_manager_idTousers.deleted_at,
      reviewer_organization_active: bsc.users_employee_bsc_direct_manager_idTousers.departments.status === 'ACTIVE'
        && bsc.users_employee_bsc_direct_manager_idTousers.positions.status === 'ACTIVE',
      reviewer_role: bsc.users_employee_bsc_direct_manager_idTousers.user_roles_user_roles_user_idTousers
        .map((assignment) => assignment.roles.code)
        .find((code) => code === 'DIRECTOR' || code === 'MANAGER') ?? 'MANAGER',
      department_status: bsc.departments.status, position_status: bsc.positions.status,
      items: bsc.employee_bsc_items,
      reviewer_matches_owner: bsc.users_employee_bsc_employee_idTousers.direct_manager_id === bsc.direct_manager_id,
    }) : null);
  }

  private async requireActiveReviewer(db: Transaction, employeeId: string, managerId: string): Promise<'DIRECTOR' | 'MANAGER'> {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const relationship = await db.manager_relationships.findFirst({ where: {
      employee_id: employeeId,
      manager_id: managerId,
      is_primary: true,
      start_date: { lte: date },
      OR: [{ end_date: null }, { end_date: { gte: date } }],
      users_manager_relationships_employee_idTousers: {
        direct_manager_id: managerId, status: 'ACTIVE', deleted_at: null,
        departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' },
      },
      users_manager_relationships_manager_idTousers: {
        status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' },
      },
    }, select: {
      users_manager_relationships_manager_idTousers: { select: {
        user_roles_user_roles_user_idTousers: {
          where: { OR: [{ expires_at: null }, { expires_at: { gt: now } }], roles: { status: 'ACTIVE' } },
          select: { roles: { select: { code: true } } },
        },
      } },
    } });
    if (!relationship) throw new ForbiddenException({ code: 'BSC_ACTIVE_REVIEWER_REQUIRED', message: 'KhÃ´ng xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c ngÆ°á»i duyá»‡t trá»±c tiáº¿p Ä‘ang cÃ³ hiá»‡u lá»±c.' });
    const role = relationship.users_manager_relationships_manager_idTousers.user_roles_user_roles_user_idTousers
      .map((assignment) => assignment.roles.code)
      .find((code) => code === 'DIRECTOR' || code === 'MANAGER');
    return role === 'DIRECTOR' ? 'DIRECTOR' : 'MANAGER';
  }

  private workflowConflict(): never {
    throw new ConflictException({ code: 'BSC_WORKFLOW_CONFLICT', message: 'Trạng thái BSC vừa được thay đổi bởi yêu cầu khác.' });
  }

  private async assertPlanDefinitionEditableInTransaction(db: Transaction, bscId: string): Promise<void> {
    await this.assertCycleActionForBscInTransaction(db, bscId, 'EDIT_PLAN');
    const bsc = await db.employee_bsc.findUniqueOrThrow({ where: { id: bscId }, select: { plan_status: true } });
    if (!['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.plan_status)) this.fieldLocked();
  }

  private async assertEvaluationResultEditableInTransaction(db: Transaction, bscId: string): Promise<void> {
    await this.assertCycleActionForBscInTransaction(db, bscId, 'EDIT_EVALUATION');
    const bsc = await db.employee_bsc.findUniqueOrThrow({ where: { id: bscId }, select: { plan_status: true, evaluation_status: true } });
    if (bsc.plan_status !== 'APPROVED' || !['DRAFT', 'RETURNED', 'REOPENED'].includes(bsc.evaluation_status)) this.fieldLocked();
  }

  private fieldLocked(): never {
    throw new ForbiddenException({ code: 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE', message: 'Trường này đang bị khóa ở giai đoạn workflow hiện tại.' });
  }

  private async assertCycleActionForBscInTransaction(
    db: Transaction,
    bscId: string,
    action: BscCycleBusinessAction,
  ): Promise<void> {
    const bsc = await db.employee_bsc.findUnique({ where: { id: bscId }, select: { cycle_id: true } });
    if (!bsc) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
    await this.assertCycleActionInTransaction(db, bsc.cycle_id, action);
  }

  private async assertCycleActionInTransaction(
    db: Transaction,
    cycleId: string,
    action: BscCycleBusinessAction,
  ): Promise<void> {
    const cycle = await db.bsc_cycles.findUnique({ where: { id: cycleId }, select: {
      status: true, start_date: true, end_date: true, submission_deadline: true,
    } });
    if (!cycle) throw new NotFoundException({ code: 'BSC_CYCLE_NOT_FOUND', message: 'Không tìm thấy kỳ BSC.' });
    this.cyclePolicy.assertBusinessAction(this.cycleTiming(cycle), action);
  }

  private cycleTiming(cycle: {
    status: string; start_date: Date; end_date: Date; submission_deadline: Date;
  }): CycleTiming {
    return {
      status: cycle.status, startDate: cycle.start_date, endDate: cycle.end_date,
      submissionDeadline: cycle.submission_deadline,
    };
  }

  private async requireItemInBsc(db: Transaction, bscId: string, itemId: string) {
    const item = await db.employee_bsc_items.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException({ code: 'BSC_ITEM_NOT_FOUND', message: 'Không tìm thấy KPI.' });
    if (item.employee_bsc_id !== bscId) throw new NotFoundException({ code: 'BSC_ITEM_NOT_IN_BSC', message: 'KPI không thuộc BSC trên đường dẫn.' });
    return item;
  }

  private itemAudit(item: {
    id: string; employee_bsc_id: string; kpi_code: string; kpi_name: string; description: string | null;
    measurement_unit: string | null; target_value: Prisma.Decimal | null; target_text: string | null;
    weight: Prisma.Decimal; calculation_method: string; sort_order: number;
  }) {
    return { bscId: item.employee_bsc_id, itemId: item.id, kpiCode: item.kpi_code, kpiName: item.kpi_name, description: item.description, measurementUnit: item.measurement_unit, targetValue: item.target_value, targetText: item.target_text, weight: item.weight, calculationMethod: item.calculation_method, sortOrder: item.sort_order };
  }

  private audit(db: Transaction, actor: AuthUser, action: string, entityType: string, entityId: string, oldData: unknown, newData: unknown, metadata: AuditRequestMetadata) {
    return db.audit_logs.create({ data: {
      user_id: actor.id,
      module: 'employee-bsc',
      entity_type: entityType,
      entity_id: entityId,
      action,
      old_data: oldData === null ? Prisma.JsonNull : oldData as Prisma.InputJsonValue,
      new_data: newData === null ? Prisma.JsonNull : newData as Prisma.InputJsonValue,
      ip_address: metadata.ipAddress,
      user_agent: metadata.userAgent,
    } });
  }

  private createBscCode(employeeCode: string): string {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    return `BSC_${employeeCode.trim().toUpperCase().slice(0, 32)}_${suffix}`.slice(0, 50);
  }
}
