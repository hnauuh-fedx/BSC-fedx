import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { BSC_GOAL_GROUPS } from '../employee-bsc/bsc-goal-groups';
import { BSC_CALCULATION_METHOD, BSC_MEASUREMENT_FREQUENCY, BSC_MEASUREMENT_UNIT } from '../employee-bsc/bsc-item-defaults';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { BscScoringResult, BscScoringService } from '../employee-bsc/services/bsc-scoring.service';
import { buildBscDetailWorkbook } from '../reports/bsc-detail-workbook';
import { assertBinaryActual, assertTargetCompatible, assertValidWeight } from '../employee-bsc/validators/bsc-item.validator';
import { CreateDepartmentBscItemDto, DepartmentBscReopenDto, QueryDepartmentBscDto, UpdateDepartmentBscActualDto,
  UpdateDepartmentBscDto, UpdateDepartmentBscItemDto } from './department-bsc.dto';
import { DEPARTMENT_BSC_PERMISSIONS as P } from './department-bsc.permissions';
import { NotificationPublisher } from '../notifications/notifications.publisher';
import { NOTIFICATION_EVENT, NotificationEventType } from '../notifications/notifications.types';

type Db = PrismaService | Prisma.TransactionClient;
type BscRow = Awaited<ReturnType<DepartmentBscService['requireBsc']>>;
const PLAN_EDITABLE = new Set(['DRAFT', 'RETURNED', 'REOPENED']);
const EVALUATION_EDITABLE = new Set(['DRAFT', 'RETURNED', 'REOPENED']);

@Injectable()
export class DepartmentBscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: BscScoringService,
    private readonly notifications: NotificationPublisher,
  ) {}

  async create(actor: AuthUser, cycleId: string, metadata: AuditRequestMetadata) {
    const assignment = await this.activeAssignment(actor.id);
    if (!assignment || !this.hasScopedPermission(actor, P.CREATE, assignment.department_id)) this.deny();
    const [cycle, department, reviewer] = await Promise.all([
      this.prisma.bsc_cycles.findUnique({ where: { id: cycleId } }),
      this.prisma.departments.findUnique({ where: { id: assignment.department_id } }),
      this.findReviewer(actor),
    ]);
    if (!cycle) this.notFound('BSC_CYCLE_NOT_FOUND', 'Không tìm thấy kỳ BSC.');
    if (cycle.status !== 'OPEN') this.badRequest('DEPARTMENT_BSC_CYCLE_NOT_OPEN', 'Chỉ được tạo BSC phòng ban trong kỳ đang mở.');
    if (!department || department.status !== 'ACTIVE') this.badRequest('DEPARTMENT_BSC_DEPARTMENT_INACTIVE', 'Phòng ban không còn hoạt động.');
    if (!reviewer) this.badRequest('DEPARTMENT_BSC_REVIEWER_REQUIRED', 'Không xác định được Giám đốc có quyền duyệt phòng ban.');
    try {
      const row = await this.prisma.$transaction(async (db) => {
        const created = await db.department_bsc.create({ data: {
          bsc_code: this.createCode(department.code), cycle_id: cycle.id, department_id: department.id,
          responsible_manager_id: actor.id, reviewer_id: reviewer.id, created_by: actor.id,
        } });
        await this.audit(db, actor, 'DEPARTMENT_BSC_CREATED', 'department_bsc', created.id, null,
          { cycleId, departmentId: department.id, responsibleManagerId: actor.id, reviewerId: reviewer.id }, metadata);
        return created;
      });
      return this.present(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException({ code: 'DEPARTMENT_BSC_ALREADY_EXISTS', message: 'Phòng ban đã có BSC trong kỳ này.' });
      throw error;
    }
  }

  async list(actor: AuthUser, query: QueryDepartmentBscDto) {
    const where = this.visibleWhere(actor, P.VIEW);
    const filters: Prisma.department_bscWhereInput[] = [where];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.departmentId) filters.push({ department_id: query.departmentId });
    if (query.planStatus) filters.push({ plan_status: query.planStatus });
    if (query.evaluationStatus) filters.push({ evaluation_status: query.evaluationStatus });
    if (query.search) filters.push({ OR: [
      { bsc_code: { contains: query.search, mode: 'insensitive' } },
      { departments: { name: { contains: query.search, mode: 'insensitive' } } },
      { users_department_bsc_responsible_manager_idTousers: { full_name: { contains: query.search, mode: 'insensitive' } } },
    ] });
    const finalWhere = { AND: filters };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.department_bsc.findMany({ where: finalWhere, orderBy: { created_at: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.department_bsc.count({ where: finalWhere }),
    ]);
    return { items: await Promise.all(rows.map((row) => this.present(row, false, actor))), page: query.page, limit: query.limit, total,
      filterOptions: await this.filterOptions(where) };
  }

  async pendingReview(actor: AuthUser, query: QueryDepartmentBscDto) {
    const stage = query.stage ?? 'PLAN';
    const permissions = stage === 'PLAN' ? [P.APPROVE_PLAN, P.RETURN_PLAN] : [P.APPROVE_EVALUATION, P.RETURN_EVALUATION];
    this.assertGlobalDirectorAnyPermission(actor, permissions);
    const where: Prisma.department_bscWhereInput = {};
    const filters: Prisma.department_bscWhereInput[] = [where, { responsible_manager_id: { not: actor.id } },
      stage === 'PLAN' ? { plan_status: 'SUBMITTED' } : { plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' }];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.departmentId) filters.push({ department_id: query.departmentId });
    if (query.search) filters.push({ OR: [
      { bsc_code: { contains: query.search, mode: 'insensitive' } },
      { departments: { name: { contains: query.search, mode: 'insensitive' } } },
      { users_department_bsc_responsible_manager_idTousers: { full_name: { contains: query.search, mode: 'insensitive' } } },
    ] });
    const finalWhere = { AND: filters };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.department_bsc.findMany({ where: finalWhere, orderBy: { updated_at: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.department_bsc.count({ where: finalWhere }),
    ]);
    return { items: await Promise.all(rows.map((row) => this.present(row, false, actor))), page: query.page, limit: query.limit, total,
      filterOptions: await this.filterOptions(where) };
  }

  async detail(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(this.prisma, id);
    this.assertCanView(actor, bsc);
    return this.present(bsc, true, actor);
  }

  async scoringPreview(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(this.prisma, id);
    this.assertCanView(actor, bsc);
    const items = await this.prisma.department_bsc_items.findMany({ where: { department_bsc_id: id } });
    const { canonicalTotalWeightedScore: _canonical, ...result } = this.score(items);
    return { bscId: id, planStatus: bsc.plan_status, evaluationStatus: bsc.evaluation_status, ...result };
  }

  async export(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(this.prisma, id);
    this.assertCanView(actor, bsc, P.EXPORT);
    const detail = await this.present(bsc, true);
    const rawItems = await this.prisma.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: [{ goal_group_code: 'asc' }, { sort_order: 'asc' }] });
    const score = this.score(rawItems); const scoreByItem = new Map(score.items.map(item => [item.itemId, item]));
    const evaluationApprover = bsc.evaluation_approved_by
      ? await this.prisma.users.findUnique({ where: { id: bsc.evaluation_approved_by }, select: { full_name: true } }) : null;
    const bytes = await buildBscDetailWorkbook({ sheetName: 'BSC phòng ban', subjectLabel: 'PHÒNG BAN', subjectName: detail.departments?.name ?? '',
      departmentName: detail.departments?.name ?? '', cycleName: detail.bsc_cycles?.name ?? '', cycleYear: detail.bsc_cycles?.year ?? new Date().getFullYear(),
      evaluatorName: evaluationApprover?.full_name ?? '', implementerName: detail.responsible_manager?.full_name ?? '',
      totalScore: score.isComplete ? Number(bsc.final_score ?? score.totalWeightedScore) : null, finalGrade: bsc.final_grade,
      items: rawItems.map((item) => { const itemScore = scoreByItem.get(item.id); return { kpo: item.description, kpi: item.kpi_name, goalGroupCode: item.goal_group_code,
        unit: item.measurement_unit, target: item.target_value === null ? item.target_text : Number(item.target_value), weight: Number(item.weight), frequency: item.measurement_frequency,
        actual: item.actual_value === null ? item.actual_text : Number(item.actual_value), achievement: itemScore?.roundedAchievementPercentage ?? null,
        workScore: itemScore?.roundedWorkScore ?? null, weightedScore: itemScore?.weightedScore ?? null,
        explanation: item.manager_note ?? item.director_note, sortOrder: item.sort_order }; }) });
    await this.audit(this.prisma, actor, 'DEPARTMENT_BSC_EXPORTED', 'department_bsc', id, null,
      { format: 'xlsx', itemCount: detail.department_bsc_items.length }, metadata);
    return { buffer: bytes, fileName: `department-bsc-${bsc.bsc_code}.xlsx` };
  }

  async update(actor: AuthUser, id: string, dto: UpdateDepartmentBscDto, metadata: AuditRequestMetadata) {
    if (dto.managerComment === undefined) this.badRequest('DEPARTMENT_BSC_NO_CHANGES', 'Không có dữ liệu cần cập nhật.');
    const bsc = await this.requireBsc(this.prisma, id);
    await this.assertOwnerCanEditPlan(actor, bsc);
    await this.assertCycleEditable(this.prisma, bsc.cycle_id);
    const row = await this.prisma.$transaction(async (db) => {
      const current = await this.lockBsc(db, id);
      await this.assertOwnerCanEditPlan(actor, current);
      await this.assertCycleEditable(db, current.cycle_id);
      const updated = await db.department_bsc.update({ where: { id }, data: { manager_comment: dto.managerComment, updated_at: new Date() } });
      await this.audit(db, actor, 'DEPARTMENT_BSC_UPDATED', 'department_bsc', id, { managerComment: current.manager_comment }, { managerComment: dto.managerComment }, metadata);
      return updated;
    });
    return this.present(row);
  }

  async delete(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(this.prisma, id);
    await this.assertOwner(actor, bsc, P.DELETE_DRAFT);
    if (bsc.plan_status !== 'DRAFT' || bsc.evaluation_status !== 'NOT_STARTED') this.deny();
    await this.prisma.$transaction(async (db) => {
      const current = await this.lockBsc(db, id);
      await this.assertOwner(actor, current, P.DELETE_DRAFT);
      if (current.plan_status !== 'DRAFT' || current.evaluation_status !== 'NOT_STARTED') this.deny();
      await this.audit(db, actor, 'DEPARTMENT_BSC_DELETED', 'department_bsc', id, { bscCode: current.bsc_code }, null, metadata);
      await db.department_bsc.delete({ where: { id } });
    });
    return { success: true };
  }

  async createItem(actor: AuthUser, bscId: string, dto: CreateDepartmentBscItemDto, metadata: AuditRequestMetadata) {
    assertValidWeight(dto.weight);
    const method = dto.calculationMethod ?? BSC_CALCULATION_METHOD;
    assertTargetCompatible(method, dto.targetValue);
    const bsc = await this.requireBsc(this.prisma, bscId);
    await this.assertOwnerCanEditPlan(actor, bsc);
    await this.assertCycleEditable(this.prisma, bsc.cycle_id);
    try {
      return await this.prisma.$transaction(async (db) => {
        const current = await this.lockBsc(db, bscId);
        await this.assertOwnerCanEditPlan(actor, current);
        await this.assertCycleEditable(db, current.cycle_id);
        await this.assertTotalWeight(db, bscId, dto.weight);
        const item = await db.department_bsc_items.create({ data: {
          department_bsc_id: bscId, kpi_code: dto.kpiCode.trim(), kpi_name: dto.kpiName.trim(), description: dto.description,
          goal_group_code: dto.goalGroupCode ?? 'UNIT_PROFESSIONAL', measurement_unit: dto.measurementUnit ?? BSC_MEASUREMENT_UNIT,
          measurement_frequency: dto.measurementFrequency ?? BSC_MEASUREMENT_FREQUENCY, target_value: dto.targetValue,
          target_text: dto.targetText, weight: dto.weight, calculation_method: method, sort_order: dto.sortOrder, created_by: actor.id,
        } });
        await this.audit(db, actor, 'DEPARTMENT_BSC_KPI_CREATED', 'department_bsc_item', item.id, null, this.itemAudit(item), metadata);
        return this.presentItem(item);
      });
    } catch (error) { this.mapUnique(error); }
  }

  async updateItem(actor: AuthUser, bscId: string, itemId: string, dto: UpdateDepartmentBscItemDto, metadata: AuditRequestMetadata) {
    if (!Object.keys(dto).length) this.badRequest('DEPARTMENT_BSC_NO_CHANGES', 'Không có dữ liệu cần cập nhật.');
    if (dto.weight !== undefined) assertValidWeight(dto.weight);
    const [bsc, item] = await Promise.all([this.requireBsc(this.prisma, bscId), this.requireItem(this.prisma, bscId, itemId)]);
    await this.assertOwnerCanEditPlan(actor, bsc);
    await this.assertCycleEditable(this.prisma, bsc.cycle_id);
    const method = dto.calculationMethod ?? item.calculation_method;
    const target = dto.targetValue ?? (item.target_value === null ? undefined : Number(item.target_value));
    assertTargetCompatible(method, target);
    assertBinaryActual(method, item.actual_value === null ? undefined : Number(item.actual_value));
    try {
      return await this.prisma.$transaction(async (db) => {
        const current = await this.lockBsc(db, bscId);
        await this.assertOwnerCanEditPlan(actor, current);
        await this.assertCycleEditable(db, current.cycle_id);
        const currentItem = await this.requireItem(db, bscId, itemId);
        const currentMethod = dto.calculationMethod ?? currentItem.calculation_method;
        const currentTarget = dto.targetValue ?? (currentItem.target_value === null ? undefined : Number(currentItem.target_value));
        assertTargetCompatible(currentMethod, currentTarget);
        assertBinaryActual(currentMethod, currentItem.actual_value === null ? undefined : Number(currentItem.actual_value));
        if (dto.weight !== undefined) await this.assertTotalWeight(db, bscId, dto.weight, currentItem.id);
        const updated = await db.department_bsc_items.update({ where: { id: itemId }, data: {
          ...(dto.kpiCode !== undefined ? { kpi_code: dto.kpiCode.trim() } : {}),
          ...(dto.kpiName !== undefined ? { kpi_name: dto.kpiName.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.goalGroupCode !== undefined ? { goal_group_code: dto.goalGroupCode } : {}),
          ...(dto.measurementUnit !== undefined ? { measurement_unit: dto.measurementUnit } : {}),
          ...(dto.measurementFrequency !== undefined ? { measurement_frequency: dto.measurementFrequency } : {}),
          ...(dto.targetValue !== undefined ? { target_value: dto.targetValue } : {}),
          ...(dto.targetText !== undefined ? { target_text: dto.targetText } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.calculationMethod !== undefined ? { calculation_method: dto.calculationMethod } : {}),
          ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}), updated_at: new Date(),
        } });
        await this.audit(db, actor, 'DEPARTMENT_BSC_KPI_UPDATED', 'department_bsc_item', itemId, this.itemAudit(currentItem), this.itemAudit(updated), metadata);
        return this.presentItem(updated);
      });
    } catch (error) { this.mapUnique(error); }
  }

  async updateActual(actor: AuthUser, bscId: string, itemId: string, dto: UpdateDepartmentBscActualDto, metadata: AuditRequestMetadata) {
    if (!Object.keys(dto).length) this.badRequest('DEPARTMENT_BSC_NO_CHANGES', 'Không có dữ liệu cần cập nhật.');
    const [bsc, item] = await Promise.all([this.requireBsc(this.prisma, bscId), this.requireItem(this.prisma, bscId, itemId)]);
    await this.assertOwner(actor, bsc, P.EDIT);
    if (bsc.plan_status !== 'APPROVED' || !EVALUATION_EDITABLE.has(bsc.evaluation_status)) this.deny();
    await this.assertCycleEditable(this.prisma, bsc.cycle_id);
    assertBinaryActual(item.calculation_method, dto.actualValue);
    const updated = await this.prisma.$transaction(async (db) => {
      const current = await this.lockBsc(db, bscId);
      await this.assertOwner(actor, current, P.EDIT);
      if (current.plan_status !== 'APPROVED' || !EVALUATION_EDITABLE.has(current.evaluation_status)) this.deny();
      await this.assertCycleEditable(db, current.cycle_id);
      const currentItem = await this.requireItem(db, bscId, itemId);
      assertBinaryActual(currentItem.calculation_method, dto.actualValue);
      const row = await db.department_bsc_items.update({ where: { id: itemId }, data: {
        ...(dto.actualValue !== undefined ? { actual_value: dto.actualValue } : {}),
        ...(dto.actualText !== undefined ? { actual_text: dto.actualText } : {}),
        ...(dto.managerNote !== undefined ? { manager_note: dto.managerNote } : {}), updated_at: new Date(),
      } });
      await this.audit(db, actor, 'DEPARTMENT_BSC_ACTUAL_UPDATED', 'department_bsc_item', itemId,
        { actualValue: currentItem.actual_value, actualText: currentItem.actual_text, managerNote: currentItem.manager_note },
        { actualValue: row.actual_value, actualText: row.actual_text, managerNote: row.manager_note }, metadata);
      return row;
    });
    return this.presentItem(updated);
  }

  async deleteItem(actor: AuthUser, bscId: string, itemId: string, metadata: AuditRequestMetadata) {
    const [bsc, item] = await Promise.all([this.requireBsc(this.prisma, bscId), this.requireItem(this.prisma, bscId, itemId)]);
    await this.assertOwnerCanEditPlan(actor, bsc);
    await this.assertCycleEditable(this.prisma, bsc.cycle_id);
    await this.prisma.$transaction(async (db) => {
      const current = await this.lockBsc(db, bscId);
      await this.assertOwnerCanEditPlan(actor, current);
      await this.assertCycleEditable(db, current.cycle_id);
      const currentItem = await this.requireItem(db, bscId, itemId);
      await this.audit(db, actor, 'DEPARTMENT_BSC_KPI_DELETED', 'department_bsc_item', currentItem.id, this.itemAudit(currentItem), null, metadata);
      await db.department_bsc_items.delete({ where: { id: currentItem.id } });
    });
    return { success: true };
  }

  async submitPlan(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const row = await this.prisma.$transaction(async (db) => {
      const bsc = await this.lockBsc(db, id);
      await this.assertOwner(actor, bsc, P.SUBMIT_PLAN);
      if (!PLAN_EDITABLE.has(bsc.plan_status) || bsc.evaluation_status !== 'NOT_STARTED') this.conflict('DEPARTMENT_BSC_PLAN_INVALID_TRANSITION');
      await this.assertCycleEditable(db, bsc.cycle_id);
      const items = await db.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: { sort_order: 'asc' } });
      this.assertPlanComplete(items);
      const now = new Date();
      const claimed = await db.department_bsc.updateMany({ where: { id, plan_status: bsc.plan_status, evaluation_status: 'NOT_STARTED' }, data: { plan_status: 'SUBMITTED', plan_submitted_at: now, updated_at: now } });
      if (claimed.count !== 1) this.conflict('DEPARTMENT_BSC_PLAN_INVALID_TRANSITION');
      const updated = await this.requireBsc(db, id);
      await db.department_bsc_approval_steps.upsert({ where: { department_bsc_id_stage: { department_bsc_id: id, stage: 'PLAN' } },
        create: { department_bsc_id: id, stage: 'PLAN', approver_id: bsc.reviewer_id }, update: { approver_id: bsc.reviewer_id, status: 'PENDING', comment: null, acted_at: null } });
      await this.recordTransition(db, actor, updated, 'PLAN', bsc.plan_status, 'SUBMITTED', 'SUBMIT', null, items, metadata);
      return updated;
    });
    return this.present(row);
  }

  async reviewPlan(actor: AuthUser, id: string, action: 'APPROVE' | 'RETURN', rawReason: string | undefined, metadata: AuditRequestMetadata) {
    const permission = action === 'APPROVE' ? P.APPROVE_PLAN : P.RETURN_PLAN;
    const reason = action === 'RETURN' ? this.reason(rawReason) : null;
    const row = await this.prisma.$transaction(async (db) => {
      const bsc = await this.lockBsc(db, id);
      await this.assertReviewer(actor, bsc, permission);
      if (bsc.plan_status !== 'SUBMITTED') this.conflict('DEPARTMENT_BSC_PLAN_INVALID_TRANSITION');
      await this.assertCycleReviewable(db, bsc.cycle_id);
      const items = await db.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: { sort_order: 'asc' } });
      const now = new Date();
      const target = action === 'APPROVE' ? 'APPROVED' : 'RETURNED';
      const claimed = await db.department_bsc.updateMany({ where: { id, plan_status: 'SUBMITTED' }, data: action === 'APPROVE'
        ? { plan_status: target, plan_approved_at: now, plan_approved_by: actor.id, evaluation_status: 'DRAFT', updated_at: now }
        : { plan_status: target, updated_at: now } });
      if (claimed.count !== 1) this.conflict('DEPARTMENT_BSC_PLAN_INVALID_TRANSITION');
      const updated = await this.requireBsc(db, id);
      await db.department_bsc_approval_steps.update({ where: { department_bsc_id_stage: { department_bsc_id: id, stage: 'PLAN' } }, data: { status: action === 'APPROVE' ? 'APPROVED' : 'RETURNED', comment: reason, acted_at: now } });
      await db.department_bsc_reviews.create({ data: { department_bsc_id: id, reviewer_id: actor.id, stage: 'PLAN', action, comment: reason } });
      await this.recordTransition(db, actor, updated, 'PLAN', 'SUBMITTED', target, action, reason, items, metadata);
      return updated;
    });
    return this.present(row);
  }

  async submitEvaluation(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const row = await this.prisma.$transaction(async (db) => {
      const bsc = await this.lockBsc(db, id);
      await this.assertOwner(actor, bsc, P.SUBMIT_EVALUATION);
      if (bsc.plan_status !== 'APPROVED' || !EVALUATION_EDITABLE.has(bsc.evaluation_status)) this.conflict('DEPARTMENT_BSC_EVALUATION_INVALID_TRANSITION');
      await this.assertCycleEditable(db, bsc.cycle_id);
      const items = await db.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: { sort_order: 'asc' } });
      const scoring = this.score(items);
      this.assertScoringComplete(scoring);
      const now = new Date();
      const claimed = await db.department_bsc.updateMany({ where: { id, plan_status: 'APPROVED', evaluation_status: bsc.evaluation_status }, data: { evaluation_status: 'SUBMITTED', evaluation_submitted_at: now, updated_at: now } });
      if (claimed.count !== 1) this.conflict('DEPARTMENT_BSC_EVALUATION_INVALID_TRANSITION');
      const updated = await this.requireBsc(db, id);
      await db.department_bsc_approval_steps.upsert({ where: { department_bsc_id_stage: { department_bsc_id: id, stage: 'EVALUATION' } },
        create: { department_bsc_id: id, stage: 'EVALUATION', approver_id: bsc.reviewer_id }, update: { approver_id: bsc.reviewer_id, status: 'PENDING', comment: null, acted_at: null } });
      await this.recordTransition(db, actor, updated, 'EVALUATION', bsc.evaluation_status, 'SUBMITTED', 'SUBMIT', null, items, metadata, scoring);
      return updated;
    });
    return this.present(row);
  }

  async reviewEvaluation(actor: AuthUser, id: string, action: 'APPROVE' | 'RETURN', rawReason: string | undefined, metadata: AuditRequestMetadata) {
    const permission = action === 'APPROVE' ? P.APPROVE_EVALUATION : P.RETURN_EVALUATION;
    const reason = action === 'RETURN' ? this.reason(rawReason) : null;
    const row = await this.prisma.$transaction(async (db) => {
      const bsc = await this.lockBsc(db, id);
      await this.assertReviewer(actor, bsc, permission);
      if (bsc.plan_status !== 'APPROVED' || bsc.evaluation_status !== 'SUBMITTED') this.conflict('DEPARTMENT_BSC_EVALUATION_INVALID_TRANSITION');
      await this.assertCycleReviewable(db, bsc.cycle_id);
      const items = await db.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: { sort_order: 'asc' } });
      const scoring = this.score(items);
      if (action === 'APPROVE') this.assertScoringComplete(scoring);
      const now = new Date();
      const target = action === 'APPROVE' ? 'APPROVED' : 'RETURNED';
      if (action === 'APPROVE') {
        for (const result of scoring.items) await db.department_bsc_items.update({ where: { id: result.itemId }, data: {
          achievement_percent: result.roundedAchievementPercentage ?? 0, weighted_score: result.weightedScore ?? 0,
        } });
      }
      const claimed = await db.department_bsc.updateMany({ where: { id, plan_status: 'APPROVED', evaluation_status: 'SUBMITTED' }, data: action === 'APPROVE'
        ? { evaluation_status: target, evaluation_approved_at: now, evaluation_approved_by: actor.id,
          total_score: scoring.canonicalTotalWeightedScore, final_score: scoring.canonicalTotalWeightedScore,
          final_grade: scoring.classification, updated_at: now }
        : { evaluation_status: target, updated_at: now } });
      if (claimed.count !== 1) this.conflict('DEPARTMENT_BSC_EVALUATION_INVALID_TRANSITION');
      const updated = await this.requireBsc(db, id);
      await db.department_bsc_approval_steps.update({ where: { department_bsc_id_stage: { department_bsc_id: id, stage: 'EVALUATION' } }, data: { status: action === 'APPROVE' ? 'APPROVED' : 'RETURNED', comment: reason, acted_at: now } });
      await db.department_bsc_reviews.create({ data: { department_bsc_id: id, reviewer_id: actor.id, stage: 'EVALUATION', action,
        score_before: bsc.final_score, score_after: action === 'APPROVE' ? scoring.canonicalTotalWeightedScore : null, comment: reason } });
      const snapshotItems = action === 'APPROVE'
        ? await db.department_bsc_items.findMany({ where: { department_bsc_id: id }, orderBy: { sort_order: 'asc' } })
        : items;
      await this.recordTransition(db, actor, updated, 'EVALUATION', 'SUBMITTED', target, action, reason, snapshotItems, metadata, scoring);
      return updated;
    });
    return this.present(row);
  }

  async duplicate(actor: AuthUser, sourceId: string, targetCycleId: string, metadata: AuditRequestMetadata) {
    const source = await this.requireBsc(this.prisma, sourceId);
    await this.assertOwner(actor, source, P.DUPLICATE);
    const cycle = await this.prisma.bsc_cycles.findUnique({ where: { id: targetCycleId } });
    if (!cycle || cycle.status !== 'OPEN') this.badRequest('DEPARTMENT_BSC_TARGET_CYCLE_INVALID', 'Kỳ đích phải tồn tại và đang mở.');
    try {
      const row = await this.prisma.$transaction(async (db) => {
        const current = await this.lockBsc(db, sourceId);
        await this.assertOwner(actor, current, P.DUPLICATE);
        const targetCycle = await this.lockCycle(db, targetCycleId);
        if (targetCycle.status !== 'OPEN') this.badRequest('DEPARTMENT_BSC_TARGET_CYCLE_INVALID', 'Kỳ đích phải tồn tại và đang mở.');
        const sourceVersion = await db.department_bsc_versions.findFirst({
          where: { department_bsc_id: sourceId, stage: 'PLAN', version_type: 'PLAN_APPROVE' },
          orderBy: { version_number: 'asc' },
          select: { id: true, snapshot: true },
        });
        const snapshot = sourceVersion?.snapshot as { items?: Array<{
          kpi_code: string; kpi_name: string; description: string | null; goal_group_code: string;
          measurement_unit: string; measurement_frequency: string; target_value: string | number | null;
          target_text: string | null; weight: string | number; calculation_method: string; sort_order: number;
        }> } | undefined;
        const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
        const created = await db.department_bsc.create({ data: { bsc_code: this.createCode('DUP'), cycle_id: targetCycleId,
          department_id: current.department_id, responsible_manager_id: actor.id, reviewer_id: current.reviewer_id,
          source_bsc_id: current.id, created_by: actor.id } });
        if (items.length) await db.department_bsc_items.createMany({ data: items.map((item) => ({ department_bsc_id: created.id,
          kpi_code: item.kpi_code, kpi_name: item.kpi_name, description: item.description, goal_group_code: item.goal_group_code,
          measurement_unit: item.measurement_unit, measurement_frequency: item.measurement_frequency, target_value: item.target_value,
          target_text: item.target_text, weight: item.weight, calculation_method: item.calculation_method, sort_order: item.sort_order,
          created_by: actor.id })) });
        await this.audit(db, actor, 'DEPARTMENT_BSC_DUPLICATED', 'department_bsc', created.id, null,
          { sourceBscId: source.id, sourceVersionId: sourceVersion?.id ?? null, targetCycleId }, metadata);
        return created;
      });
      return this.present(row);
    } catch (error) { this.mapUnique(error); }
  }

  async versions(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(this.prisma, id);
    this.assertCanView(actor, bsc, P.VIEW_VERSION);
    return this.prisma.department_bsc_versions.findMany({ where: { department_bsc_id: id }, orderBy: { version_number: 'desc' } });
  }

  async requestReopen(actor: AuthUser, id: string, dto: DepartmentBscReopenDto, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(this.prisma, id);
    await this.assertOwner(actor, bsc, P.REQUEST_REOPEN);
    if (dto.stage === 'PLAN' ? bsc.plan_status !== 'APPROVED' : bsc.evaluation_status !== 'APPROVED') this.conflict('DEPARTMENT_BSC_REOPEN_NOT_AVAILABLE');
    try {
      return await this.prisma.$transaction(async (db) => {
        const current = await this.lockBsc(db, id);
        await this.assertOwner(actor, current, P.REQUEST_REOPEN);
        if (dto.stage === 'PLAN' ? current.plan_status !== 'APPROVED' : current.evaluation_status !== 'APPROVED') this.conflict('DEPARTMENT_BSC_REOPEN_NOT_AVAILABLE');
        if (current.responsible_manager_id !== actor.id) {
          await db.department_bsc.update({ where: { id }, data: { responsible_manager_id: actor.id, updated_at: new Date() } });
          await this.audit(db, actor, 'DEPARTMENT_BSC_MANAGER_HANDOVER', 'department_bsc', id,
            { responsibleManagerId: current.responsible_manager_id }, { responsibleManagerId: actor.id }, metadata);
        }
        const request = await db.department_bsc_unlock_requests.create({ data: { department_bsc_id: id, stage: dto.stage,
          requested_by: actor.id, reviewer_id: current.reviewer_id, request_reason: this.reason(dto.reason) } });
        await this.audit(db, actor, 'DEPARTMENT_BSC_REOPEN_REQUESTED', 'department_bsc_unlock_request', request.id, null, request, metadata);
        await this.notifications.publish(db, {
          type: NOTIFICATION_EVENT.DEPARTMENT_BSC_REOPEN_REQUESTED,
          resourceId: request.id,
          sourceId: request.id,
          actorId: actor.id,
        });
        return request;
      });
    } catch (error) { this.mapUnique(error); }
  }

  async pendingReopen(actor: AuthUser, query: QueryDepartmentBscDto) {
    this.assertGlobalDirectorPermission(actor, P.REVIEW_REOPEN);
    const where: Prisma.department_bscWhereInput = {};
    const bscFilters: Prisma.department_bscWhereInput[] = [where];
    if (query.cycleId) bscFilters.push({ cycle_id: query.cycleId });
    if (query.departmentId) bscFilters.push({ department_id: query.departmentId });
    if (query.search) bscFilters.push({ OR: [
      { bsc_code: { contains: query.search, mode: 'insensitive' } },
      { departments: { name: { contains: query.search, mode: 'insensitive' } } },
      { users_department_bsc_responsible_manager_idTousers: { full_name: { contains: query.search, mode: 'insensitive' } } },
    ] });
    const requestWhere: Prisma.department_bsc_unlock_requestsWhereInput = { status: 'PENDING', department_bsc: { AND: bscFilters } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.department_bsc_unlock_requests.findMany({ where: requestWhere, orderBy: { created_at: 'asc' },
        skip: (query.page - 1) * query.limit, take: query.limit,
        include: { department_bsc: { include: { bsc_cycles: true, departments: true,
          users_department_bsc_responsible_manager_idTousers: { select: { id: true, employee_code: true, full_name: true } } } } } }),
      this.prisma.department_bsc_unlock_requests.count({ where: requestWhere }),
    ]);
    const reviewCapabilities = { canApproveReopen: true, canRejectReopen: true };
    return { items: rows.map((row) => ({ ...row, review_capabilities: reviewCapabilities })),
      page: query.page, limit: query.limit, total, filterOptions: await this.filterOptions(where) };
  }

  async resetApproved(actor: AuthUser, id: string, stage: 'PLAN' | 'EVALUATION', rawReason: string, metadata: AuditRequestMetadata) {
    const reason = this.reason(rawReason);
    return this.prisma.$transaction(async (db) => {
      const bsc = await this.lockBsc(db, id);
      await this.assertDirectorReset(actor, bsc);
      await this.assertCycleEditable(db, bsc.cycle_id);
      if (stage === 'PLAN' ? bsc.plan_status !== 'APPROVED'
        : bsc.plan_status !== 'APPROVED' || bsc.evaluation_status !== 'APPROVED') {
        this.conflict('DEPARTMENT_BSC_REOPEN_NOT_AVAILABLE');
      }
      const now = new Date();
      const resetRecord = await db.department_bsc_unlock_requests.create({ data: {
        department_bsc_id: id, stage, requested_by: actor.id, reviewer_id: actor.id,
        request_reason: reason, request_source: 'DIRECTOR_RESET', status: 'APPROVED', reviewed_by: actor.id,
        review_reason: reason, reviewed_at: now,
      } });
      await db.department_bsc_unlock_requests.updateMany({ where: {
        department_bsc_id: id, status: 'PENDING', id: { not: resetRecord.id }, ...(stage === 'EVALUATION' ? { stage } : {}),
      }, data: { status: 'EXPIRED', reviewed_by: actor.id, review_reason: 'Yêu cầu hết hiệu lực do Giám đốc đã mở lại trực tiếp BSC.', reviewed_at: now } });
      await this.reopenApprovedStage(db, actor, bsc, stage, reason, metadata, 'RESET_APPROVED');
      await this.audit(db, actor, `DEPARTMENT_BSC_${stage}_RESET_BY_DIRECTOR`, 'department_bsc_unlock_request', resetRecord.id,
        null, resetRecord, metadata);
      await this.notifications.publish(db, { type: NOTIFICATION_EVENT.DEPARTMENT_BSC_REOPEN_APPROVED,
        resourceId: resetRecord.id, sourceId: resetRecord.id, actorId: actor.id });
      return resetRecord;
    });
  }

  async reviewReopen(actor: AuthUser, requestId: string, action: 'APPROVE' | 'REJECT', rawReason: string | undefined, metadata: AuditRequestMetadata) {
    return this.prisma.$transaction(async (db) => {
      const request = await db.department_bsc_unlock_requests.findUnique({ where: { id: requestId } });
      if (!request) this.notFound('DEPARTMENT_BSC_REOPEN_NOT_FOUND', 'Không tìm thấy yêu cầu mở lại.');
      const bsc = await this.lockBsc(db, request.department_bsc_id);
      await this.assertReviewer(actor, bsc, P.REVIEW_REOPEN);
      if (request.status !== 'PENDING') this.conflict('DEPARTMENT_BSC_REOPEN_ALREADY_REVIEWED');
      const reason =
        action === 'REJECT' ? this.reason(rawReason) : this.optionalReason(rawReason);
      const now = new Date();
      const claimed = await db.department_bsc_unlock_requests.updateMany({ where: { id: requestId, status: 'PENDING' }, data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewed_by: actor.id, review_reason: reason, reviewed_at: now,
      } });
      if (claimed.count !== 1) this.conflict('DEPARTMENT_BSC_REOPEN_ALREADY_REVIEWED');
      const updatedRequest = await db.department_bsc_unlock_requests.findUniqueOrThrow({ where: { id: requestId } });
      if (action === 'APPROVE') {
        await this.reopenApprovedStage(db, actor, bsc, request.stage as 'PLAN' | 'EVALUATION', reason, metadata, 'REOPEN');
      }
      await this.audit(db, actor, `DEPARTMENT_BSC_REOPEN_${action}`, 'department_bsc_unlock_request', request.id, request, updatedRequest, metadata);
      await this.notifications.publish(db, {
        type: action === 'APPROVE'
          ? NOTIFICATION_EVENT.DEPARTMENT_BSC_REOPEN_APPROVED
          : NOTIFICATION_EVENT.DEPARTMENT_BSC_REOPEN_REJECTED,
        resourceId: request.id,
        sourceId: request.id,
        actorId: actor.id,
      });
      return updatedRequest;
    });
  }

  private async reopenApprovedStage(db: Prisma.TransactionClient, actor: AuthUser, bsc: BscRow,
    stage: 'PLAN' | 'EVALUATION', reason: string | null, metadata: AuditRequestMetadata, action: 'REOPEN' | 'RESET_APPROVED') {
    const itemsBefore = await db.department_bsc_items.findMany({ where: { department_bsc_id: bsc.id }, orderBy: { sort_order: 'asc' } });
    const now = new Date();
    if (stage === 'PLAN') {
      const reopened = await db.department_bsc.updateMany({ where: { id: bsc.id, plan_status: 'APPROVED' }, data: {
        plan_status: 'REOPENED', plan_approved_at: null, plan_approved_by: null,
        evaluation_status: 'NOT_STARTED', evaluation_submitted_at: null, evaluation_approved_at: null,
        evaluation_approved_by: null, total_score: 0, final_score: null, final_grade: null, updated_at: now,
      } });
      if (reopened.count !== 1) this.conflict('DEPARTMENT_BSC_REOPEN_NOT_AVAILABLE');
      await db.department_bsc_items.updateMany({ where: { department_bsc_id: bsc.id }, data: {
        actual_value: null, actual_text: null, manager_note: null, director_note: null,
        achievement_percent: 0, weighted_score: 0, updated_at: now,
      } });
      await db.department_bsc_approval_steps.updateMany({ where: { department_bsc_id: bsc.id, stage: 'EVALUATION' },
        data: { status: 'NOT_STARTED', comment: null, acted_at: null } });
    } else {
      const reopened = await db.department_bsc.updateMany({ where: { id: bsc.id, plan_status: 'APPROVED', evaluation_status: 'APPROVED' }, data: {
        evaluation_status: 'REOPENED', evaluation_approved_at: null, evaluation_approved_by: null,
        total_score: 0, final_score: null, final_grade: null, updated_at: now,
      } });
      if (reopened.count !== 1) this.conflict('DEPARTMENT_BSC_REOPEN_NOT_AVAILABLE');
    }
    await db.department_bsc_approval_steps.updateMany({ where: { department_bsc_id: bsc.id, stage },
      data: { status: 'REOPENED', comment: reason, acted_at: now } });
    const reopenedBsc = await this.requireBsc(db, bsc.id);
    const reopenedItems = await db.department_bsc_items.findMany({ where: { department_bsc_id: bsc.id }, orderBy: { sort_order: 'asc' } });
    await this.recordTransition(db, actor, reopenedBsc, stage, 'APPROVED', 'REOPENED', action, reason, reopenedItems, metadata,
      undefined, { bsc, items: itemsBefore });
    if (stage === 'PLAN' && bsc.evaluation_status !== 'NOT_STARTED') {
      await this.recordDependentStageReset(db, actor, bsc, reopenedBsc, bsc.evaluation_status, reason, metadata, itemsBefore, reopenedItems);
    }
  }

  async requireBsc(db: Db, id: string) {
    const row = await db.department_bsc.findUnique({ where: { id } });
    if (!row) this.notFound('DEPARTMENT_BSC_NOT_FOUND', 'Không tìm thấy BSC phòng ban.');
    return row;
  }

  private async lockBsc(db: Prisma.TransactionClient, id: string) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM department_bsc WHERE id = ${id}::uuid FOR UPDATE`);
    if (!rows.length) this.notFound('DEPARTMENT_BSC_NOT_FOUND', 'Không tìm thấy BSC phòng ban.');
    return this.requireBsc(db, id);
  }

  private async lockCycle(db: Prisma.TransactionClient, id: string) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM bsc_cycles WHERE id = ${id}::uuid FOR UPDATE`);
    if (!rows.length) this.notFound('BSC_CYCLE_NOT_FOUND', 'Không tìm thấy kỳ BSC.');
    return db.bsc_cycles.findUniqueOrThrow({ where: { id } });
  }

  private async requireItem(db: Db, bscId: string, itemId: string) {
    const item = await db.department_bsc_items.findUnique({ where: { id: itemId } });
    if (!item || item.department_bsc_id !== bscId) this.notFound('DEPARTMENT_BSC_ITEM_NOT_FOUND', 'Không tìm thấy KPI trong BSC phòng ban.');
    return item;
  }

  private async present(bsc: BscRow, includeDetails = true, actor?: AuthUser) {
    const [cycle, department, manager, reviewer, items, histories, reviews] = await Promise.all([
      this.prisma.bsc_cycles.findUnique({ where: { id: bsc.cycle_id } }),
      this.prisma.departments.findUnique({ where: { id: bsc.department_id } }),
      this.prisma.users.findUnique({ where: { id: bsc.responsible_manager_id }, select: { id: true, employee_code: true, full_name: true } }),
      this.prisma.users.findUnique({ where: { id: bsc.reviewer_id }, select: { id: true, employee_code: true, full_name: true } }),
      includeDetails ? this.prisma.department_bsc_items.findMany({ where: { department_bsc_id: bsc.id }, orderBy: [{ goal_group_code: 'asc' }, { sort_order: 'asc' }] }) : Promise.resolve([]),
      includeDetails ? this.prisma.department_bsc_status_histories.findMany({ where: { department_bsc_id: bsc.id }, orderBy: { changed_at: 'asc' } }) : Promise.resolve([]),
      includeDetails ? this.prisma.department_bsc_reviews.findMany({ where: { department_bsc_id: bsc.id }, orderBy: { reviewed_at: 'asc' } }) : Promise.resolve([]),
    ]);
    const reviewCapabilities = actor && cycle ? await this.reviewCapabilities(actor, bsc, cycle.status) : undefined;
    return { ...bsc, total_score: Number(bsc.total_score), final_score: bsc.final_score === null ? null : Number(bsc.final_score),
      bsc_cycles: cycle, departments: department, responsible_manager: manager, reviewer,
      department_bsc_items: items.map((item) => this.presentItem(item)), department_bsc_status_histories: histories,
      department_bsc_reviews: reviews, goal_groups: BSC_GOAL_GROUPS, review_capabilities: reviewCapabilities };
  }

  private async filterOptions(where: Prisma.department_bscWhereInput) {
    const [cycleRows, departmentRows] = await Promise.all([
      this.prisma.department_bsc.findMany({ where, distinct: ['cycle_id'], select: { bsc_cycles: { select: { id: true, name: true } } } }),
      this.prisma.department_bsc.findMany({ where, distinct: ['department_id'], select: { departments: { select: { id: true, name: true } } } }),
    ]);
    return {
      cycles: cycleRows.map((row) => row.bsc_cycles).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      departments: departmentRows.map((row) => row.departments).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    };
  }

  private async reviewCapabilities(actor: AuthUser, bsc: BscRow, cycleStatus: string) {
    const activeManager = await this.activeAssignment(actor.id);
    const reviewerEligible = actor.id !== bsc.responsible_manager_id && activeManager?.department_id !== bsc.department_id;
    const canReview = (permission: string) => reviewerEligible && this.hasGlobalDirectorPermission(actor, permission);
    const reviewable = ['OPEN', 'LOCKED'].includes(cycleStatus);
    const approvePlan = reviewable && bsc.plan_status === 'SUBMITTED' && canReview(P.APPROVE_PLAN);
    const returnPlan = reviewable && bsc.plan_status === 'SUBMITTED' && canReview(P.RETURN_PLAN);
    const approveEvaluation = reviewable && bsc.plan_status === 'APPROVED' && bsc.evaluation_status === 'SUBMITTED' && canReview(P.APPROVE_EVALUATION);
    const returnEvaluation = reviewable && bsc.plan_status === 'APPROVED' && bsc.evaluation_status === 'SUBMITTED' && canReview(P.RETURN_EVALUATION);
    const canReset = cycleStatus === 'OPEN' && reviewerEligible && this.hasGlobalDirectorResetRole(actor);
    return { canApprovePlan: approvePlan, canReturnPlan: returnPlan,
      canApproveEvaluation: approveEvaluation, canReturnEvaluation: returnEvaluation,
      canResetPlan: canReset && bsc.plan_status === 'APPROVED',
      canResetEvaluation: canReset && bsc.plan_status === 'APPROVED' && bsc.evaluation_status === 'APPROVED' };
  }

  private presentItem<T extends { target_value: Prisma.Decimal | null; actual_value: Prisma.Decimal | null; weight: Prisma.Decimal; achievement_percent: Prisma.Decimal; weighted_score: Prisma.Decimal }>(item: T) {
    return { ...item, target_value: item.target_value === null ? null : Number(item.target_value), actual_value: item.actual_value === null ? null : Number(item.actual_value),
      weight: Number(item.weight), achievement_percent: Number(item.achievement_percent), weighted_score: Number(item.weighted_score) };
  }

  private async activeAssignment(managerId: string) {
    const now = new Date();
    return this.prisma.department_manager_assignments.findFirst({ where: { manager_id: managerId, is_primary: true,
      start_date: { lte: now }, OR: [{ end_date: null }, { end_date: { gt: now } }] }, orderBy: { start_date: 'desc' } });
  }

  private async findReviewer(actor: AuthUser) {
    const directManagerId = await this.prisma.users.findUnique({ where: { id: actor.id }, select: { direct_manager_id: true } });
    const reviewerPermissions = [P.APPROVE_PLAN, P.RETURN_PLAN, P.APPROVE_EVALUATION, P.RETURN_EVALUATION];
    const where: Prisma.usersWhereInput = { status: 'ACTIVE', deleted_at: null, id: { not: actor.id },
      user_roles_user_roles_user_idTousers: { some: { roles: { code: 'DIRECTOR', status: 'ACTIVE',
        AND: reviewerPermissions.map((code) => ({ role_permissions: { some: { permissions: { code } } } })) },
        scope_type: 'GLOBAL', OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] } } };
    if (directManagerId?.direct_manager_id) {
      const direct = await this.prisma.users.findFirst({ where: { AND: [where, { id: directManagerId.direct_manager_id }] } });
      if (direct) return direct;
    }
    return this.prisma.users.findFirst({ where, orderBy: { id: 'asc' } });
  }

  private visibleWhere(actor: AuthUser, permission: string): Prisma.department_bscWhereInput {
    const scope = this.scopeWhere(actor, permission);
    if (!scope) this.deny();
    return scope;
  }

  private scopeWhere(actor: AuthUser, permission: string): Prisma.department_bscWhereInput | null {
    const assignments = actor.roles.filter((role) => role.permissions?.includes(permission));
    if (assignments.some((role) => role.scopeType === 'GLOBAL')) return {};
    const ids = assignments.filter((role) => role.scopeType === 'DEPARTMENT' && role.scopeId).map((role) => role.scopeId!);
    return ids.length ? { department_id: { in: [...new Set(ids)] } } : null;
  }

  private hasScopedPermission(actor: AuthUser, permission: string, departmentId: string) {
    return actor.permissions.includes(permission) && actor.roles.some((role) => role.permissions?.includes(permission)
      && (role.scopeType === 'GLOBAL' || (role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId)));
  }

  private assertCanView(actor: AuthUser, bsc: BscRow, permission: string = P.VIEW) {
    if (!this.hasScopedPermission(actor, permission, bsc.department_id)) this.deny();
  }

  private async assertOwner(actor: AuthUser, bsc: BscRow, permission: string) {
    if (!this.hasScopedPermission(actor, permission, bsc.department_id)) this.deny();
    const assignment = await this.activeAssignment(actor.id);
    if (!assignment || assignment.department_id !== bsc.department_id) this.deny();
  }

  private async assertOwnerCanEditPlan(actor: AuthUser, bsc: BscRow) {
    await this.assertOwner(actor, bsc, P.EDIT);
    if (!PLAN_EDITABLE.has(bsc.plan_status) || bsc.evaluation_status !== 'NOT_STARTED') this.deny();
  }

  private async assertReviewer(actor: AuthUser, bsc: BscRow, permission: string) {
    if (actor.id === bsc.responsible_manager_id) throw new ForbiddenException({ code: 'DEPARTMENT_BSC_SELF_APPROVAL_FORBIDDEN', message: 'Trưởng phòng không thể tự duyệt BSC phòng ban.' });
    const activeManager = await this.activeAssignment(actor.id);
    if (activeManager?.department_id === bsc.department_id) throw new ForbiddenException({ code: 'DEPARTMENT_BSC_SELF_APPROVAL_FORBIDDEN', message: 'Trưởng phòng đương nhiệm không thể tự duyệt BSC phòng ban.' });
    this.assertGlobalDirectorPermission(actor, permission);
  }

  private async canDirectorReset(actor: AuthUser, bsc: BscRow) {
    if (actor.id === bsc.responsible_manager_id || !this.hasGlobalDirectorResetRole(actor)) return false;
    const activeManager = await this.activeAssignment(actor.id);
    return activeManager?.department_id !== bsc.department_id;
  }

  private hasGlobalDirectorResetRole(actor: AuthUser) {
    return this.hasGlobalDirectorPermission(actor, P.RESET_APPROVED);
  }

  private hasGlobalDirectorPermission(actor: AuthUser, permission: string) {
    return actor.permissions.includes(permission) && actor.roles.some((role) => role.code === 'DIRECTOR'
      && role.scopeType === 'GLOBAL' && role.permissions?.includes(permission));
  }

  private assertGlobalDirectorPermission(actor: AuthUser, permission: string) {
    if (!this.hasGlobalDirectorPermission(actor, permission)) this.deny();
  }

  private assertGlobalDirectorAnyPermission(actor: AuthUser, permissions: string[]) {
    if (!permissions.some((permission) => this.hasGlobalDirectorPermission(actor, permission))) this.deny();
  }

  private async assertDirectorReset(actor: AuthUser, bsc: BscRow) {
    if (!await this.canDirectorReset(actor, bsc)) this.deny();
  }

  private async assertCycleEditable(db: Db, cycleId: string) {
    const cycle = await db.bsc_cycles.findUnique({ where: { id: cycleId }, select: { status: true } });
    if (!cycle || cycle.status !== 'OPEN') this.badRequest('DEPARTMENT_BSC_CYCLE_NOT_OPEN', 'Kỳ BSC không cho phép chỉnh sửa hoặc nộp.');
  }

  private async assertCycleReviewable(db: Db, cycleId: string) {
    const cycle = await db.bsc_cycles.findUnique({ where: { id: cycleId }, select: { status: true } });
    if (!cycle || !['OPEN', 'LOCKED'].includes(cycle.status)) this.badRequest('DEPARTMENT_BSC_CYCLE_NOT_REVIEWABLE', 'Kỳ BSC không cho phép duyệt.');
  }

  private assertPlanComplete(items: Array<{ kpi_name: string; target_value: Prisma.Decimal | null; target_text: string | null; weight: Prisma.Decimal; calculation_method: string }>) {
    if (!items.length) this.badRequest('DEPARTMENT_BSC_PLAN_INCOMPLETE', 'BSC phòng ban phải có ít nhất một KPI.');
    const total = items.reduce((sum, item) => sum.add(item.weight), new Prisma.Decimal(0));
    if (!total.eq(100)) this.badRequest('DEPARTMENT_BSC_TOTAL_WEIGHT_NOT_100', 'Tổng trọng số KPI phải bằng đúng 100%.');
    if (items.some((item) => !item.kpi_name.trim() || (item.target_value === null && !(item.target_text ?? '').trim())
      || !['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY'].includes(item.calculation_method))) {
      this.badRequest('DEPARTMENT_BSC_PLAN_INCOMPLETE', 'Định nghĩa KPI phòng ban chưa đầy đủ.');
    }
  }

  private score(items: Array<{ id: string; calculation_method: string; target_value: Prisma.Decimal | null; actual_value: Prisma.Decimal | null; weight: Prisma.Decimal }>) {
    return this.scoring.scoreBsc(items.map((item) => ({ itemId: item.id, calculationMethod: item.calculation_method,
      targetValue: item.target_value, actualValue: item.actual_value, weight: item.weight })));
  }

  private assertScoringComplete(result: BscScoringResult) {
    if (!result.isComplete || result.totalWeight !== 100 || result.items.some((item) => !item.isScorable)) {
      this.badRequest('DEPARTMENT_BSC_EVALUATION_INCOMPLETE', 'Mọi KPI phải có kết quả hợp lệ và tổng trọng số bằng 100%.');
    }
  }

  private async assertTotalWeight(db: Db, bscId: string, candidate: number, excludeId?: string) {
    const rows = await db.department_bsc_items.findMany({ where: { department_bsc_id: bscId, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { weight: true } });
    const total = rows.reduce((sum, row) => sum.add(row.weight), new Prisma.Decimal(candidate));
    if (total.gt(100)) this.badRequest('DEPARTMENT_BSC_TOTAL_WEIGHT_EXCEEDED', 'Tổng trọng số KPI không được vượt quá 100%.');
  }

  private async recordTransition(db: Prisma.TransactionClient, actor: AuthUser, bsc: BscRow, stage: 'PLAN' | 'EVALUATION', from: string,
    to: string, action: string, comment: string | null, items: unknown[], metadata: AuditRequestMetadata, scoring?: BscScoringResult,
    versionSnapshot?: { bsc: BscRow; items: unknown[] }) {
    const history = await db.department_bsc_status_histories.create({ data: { department_bsc_id: bsc.id, stage, from_status: from, to_status: to,
      action, comment, changed_by: actor.id, ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
    const count = await db.department_bsc_versions.count({ where: { department_bsc_id: bsc.id } });
    const snapshotBsc = versionSnapshot?.bsc ?? bsc;
    const snapshotItems = versionSnapshot?.items ?? items;
    const snapshot = JSON.parse(JSON.stringify({ bsc: snapshotBsc, items: snapshotItems,
      totalWeight: scoring?.totalWeight ?? snapshotItems.reduce<number>((sum, item) => sum + Number((item as { weight?: unknown }).weight ?? 0), 0),
      totalScore: scoring?.totalWeightedScore ?? null, finalGrade: scoring?.classification ?? null })) as Prisma.InputJsonValue;
    await db.department_bsc_versions.create({ data: { department_bsc_id: bsc.id, version_number: count + 1, stage,
      version_type: versionSnapshot ? 'PRE_REOPEN' : `${stage}_${action}`, snapshot, created_by: actor.id } });
    const beforeAudit = versionSnapshot
      ? this.reopenAuditState(versionSnapshot.bsc, versionSnapshot.items)
      : { stage, status: from };
    const afterAudit = versionSnapshot
      ? { ...this.reopenAuditState(bsc, items), reason: comment }
      : { stage, status: to, comment };
    await this.audit(db, actor, `DEPARTMENT_BSC_${stage}_${action}`, 'department_bsc', bsc.id, beforeAudit, afterAudit, metadata);
    const notificationType = this.transitionNotificationType(stage, action);
    if (notificationType) {
      await this.notifications.publish(db, {
        type: notificationType,
        resourceId: bsc.id,
        sourceId: history.id,
        actorId: actor.id,
      });
    }
  }

  private async recordDependentStageReset(db: Prisma.TransactionClient, actor: AuthUser, before: BscRow, after: BscRow,
    from: string, reason: string | null, metadata: AuditRequestMetadata, itemsBefore: unknown[], itemsAfter: unknown[]) {
    await db.department_bsc_status_histories.create({ data: { department_bsc_id: after.id, stage: 'EVALUATION',
      from_status: from, to_status: 'NOT_STARTED', action: 'RESET_BY_PLAN_REOPEN', comment: reason,
      changed_by: actor.id, ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
    await this.audit(db, actor, 'DEPARTMENT_BSC_EVALUATION_RESET_BY_PLAN_REOPEN', 'department_bsc', after.id,
      this.reopenAuditState(before, itemsBefore), { ...this.reopenAuditState(after, itemsAfter), reason }, metadata);
  }

  private reopenAuditState(bsc: BscRow, items: unknown[]) {
    return {
      planStatus: bsc.plan_status,
      evaluationStatus: bsc.evaluation_status,
      planApprovedAt: bsc.plan_approved_at,
      planApprovedBy: bsc.plan_approved_by,
      evaluationSubmittedAt: bsc.evaluation_submitted_at,
      evaluationApprovedAt: bsc.evaluation_approved_at,
      evaluationApprovedBy: bsc.evaluation_approved_by,
      totalScore: bsc.total_score,
      finalScore: bsc.final_score,
      finalGrade: bsc.final_grade,
      items: items.map((item) => {
        const row = item as { id?: unknown; actual_value?: unknown; actual_text?: unknown; manager_note?: unknown;
          director_note?: unknown; achievement_percent?: unknown; weighted_score?: unknown };
        return { id: row.id, actualValue: row.actual_value, actualText: row.actual_text,
          managerNote: row.manager_note, directorNote: row.director_note,
          achievementPercent: row.achievement_percent, weightedScore: row.weighted_score };
      }),
    };
  }

  private transitionNotificationType(stage: 'PLAN' | 'EVALUATION', action: string): NotificationEventType | null {
    if (stage === 'PLAN' && action === 'SUBMIT') return NOTIFICATION_EVENT.DEPARTMENT_BSC_PLAN_SUBMITTED;
    if (stage === 'PLAN' && action === 'APPROVE') return NOTIFICATION_EVENT.DEPARTMENT_BSC_PLAN_APPROVED;
    if (stage === 'PLAN' && action === 'RETURN') return NOTIFICATION_EVENT.DEPARTMENT_BSC_PLAN_RETURNED;
    if (stage === 'EVALUATION' && action === 'SUBMIT') return NOTIFICATION_EVENT.DEPARTMENT_BSC_EVALUATION_SUBMITTED;
    if (stage === 'EVALUATION' && action === 'APPROVE') return NOTIFICATION_EVENT.DEPARTMENT_BSC_EVALUATION_APPROVED;
    if (stage === 'EVALUATION' && action === 'RETURN') return NOTIFICATION_EVENT.DEPARTMENT_BSC_EVALUATION_RETURNED;
    return null;
  }

  private itemAudit(item: { id: string; department_bsc_id: string; kpi_code: string; kpi_name: string; target_value: Prisma.Decimal | null; weight: Prisma.Decimal; calculation_method: string }) {
    return { itemId: item.id, departmentBscId: item.department_bsc_id, kpiCode: item.kpi_code, kpiName: item.kpi_name,
      targetValue: item.target_value, weight: item.weight, calculationMethod: item.calculation_method };
  }

  private audit(db: Db, actor: AuthUser, action: string, entityType: string, entityId: string, oldData: unknown, newData: unknown, metadata: AuditRequestMetadata) {
    return db.audit_logs.create({ data: { user_id: actor.id, module: 'department-bsc', entity_type: entityType, entity_id: entityId,
      action, old_data: oldData === null ? Prisma.JsonNull : oldData as Prisma.InputJsonValue,
      new_data: newData === null ? Prisma.JsonNull : newData as Prisma.InputJsonValue,
      ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
  }

  private reason(value: string | undefined) {
    const normalized = this.optionalReason(value);
    if (!normalized) this.badRequest('DEPARTMENT_BSC_REASON_REQUIRED', 'Lý do là bắt buộc.');
    return normalized;
  }

  private optionalReason(value: string | undefined) {
    return (value ?? '').trim().replace(/<[^>]*>/g, '').trim() || null;
  }

  private createCode(departmentCode: string) {
    return `DBSC_${departmentCode.trim().toUpperCase().slice(0, 28)}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`.slice(0, 50);
  }

  private mapUnique(error: unknown): never {
    if ((error as { code?: string }).code === 'P2002') throw new ConflictException({ code: 'DEPARTMENT_BSC_CONFLICT', message: 'Dữ liệu BSC phòng ban đã tồn tại.' });
    throw error;
  }
  private deny(): never { throw new ForbiddenException({ code: 'DEPARTMENT_BSC_ACCESS_DENIED', message: 'Bạn không có quyền thực hiện thao tác này.' }); }
  private badRequest(code: string, message: string): never { throw new BadRequestException({ code, message }); }
  private conflict(code: string): never { throw new ConflictException({ code, message: 'Trạng thái BSC phòng ban đã thay đổi hoặc không hợp lệ.' }); }
  private notFound(code: string, message: string): never { throw new NotFoundException({ code, message }); }
}
