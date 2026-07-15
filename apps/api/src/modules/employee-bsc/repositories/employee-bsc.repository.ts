import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuthUser } from '../../../common/types/auth-user.type';
import { AuditRequestMetadata } from '../employee-bsc.types';
import { CreateBscItemDto, UpdateBscActualDto, UpdateBscItemDto } from '../dto/bsc-item.dto';
import { QueryEmployeeBscDto } from '../dto/query-employee-bsc.dto';
import { assertTotalWeight } from '../validators/bsc-item.validator';
import { BscScoringResult } from '../services/bsc-scoring.service';

const bscAccessSelect = {
  id: true,
  employee_id: true,
  department_id: true,
  direct_manager_id: true,
  status: true,
} satisfies Prisma.employee_bscSelect;

const bscDetailSelect = {
  ...bscAccessSelect,
  bsc_code: true,
  cycle_id: true,
  position_id: true,
  employee_comment: true,
  manager_comment: true,
  submitted_at: true,
  approved_at: true,
  approved_by: true,
  locked_at: true,
  final_score: true,
  final_grade: true,
  created_at: true,
  updated_at: true,
  bsc_cycles: { select: { id: true, code: true, name: true, cycle_type: true, year: true, month: true, quarter: true, status: true } },
  users_employee_bsc_employee_idTousers: { select: { id: true, employee_code: true, full_name: true, email: true } },
  departments: { select: { id: true, code: true, name: true } },
  positions: { select: { id: true, code: true, name: true, level: true } },
  users_employee_bsc_direct_manager_idTousers: { select: { id: true, employee_code: true, full_name: true, email: true } },
  employee_bsc_items: { orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] },
  bsc_status_histories: {
    select: {
      id: true, from_status: true, to_status: true, action: true, comment: true,
      changed_by: true, changed_at: true,
      users: { select: { id: true, employee_code: true, full_name: true } },
    },
    orderBy: { changed_at: 'asc' },
  },
} satisfies Prisma.employee_bscSelect;

type Transaction = Prisma.TransactionClient;

@Injectable()
export class EmployeeBscRepository {
  constructor(private readonly prisma: PrismaService) {}

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
          created_at: true,
          updated_at: true,
          bsc_cycles: { select: { id: true, code: true, name: true, year: true, month: true, status: true } },
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

  submitWorkflow(
    actor: AuthUser,
    id: string,
    metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => BscScoringResult,
  ) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      const scoring = validate(snapshot);
      const now = new Date();
      const changed = await db.employee_bsc.updateMany({
        where: { id, status: snapshot.status },
        data: { status: 'SUBMITTED', submitted_at: now, locked_at: now, approved_at: null, approved_by: null, updated_at: now },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: {
        employee_bsc_id: id, from_status: snapshot.status, to_status: 'SUBMITTED', action: 'SUBMIT',
        changed_by: actor.id, changed_at: now, ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
      } });
      await db.bsc_approval_steps.upsert({
        where: { employee_bsc_id_step_order: { employee_bsc_id: id, step_order: 1 } },
        create: { employee_bsc_id: id, step_order: 1, approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING' },
        update: { approver_id: snapshot.direct_manager_id, approver_role: snapshot.reviewer_role, status: 'PENDING', comment: null, acted_at: null },
      });
      await this.audit(db, actor, 'BSC_SUBMITTED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, status: snapshot.status },
        { bscId: id, employeeId: snapshot.employee_id, status: 'SUBMITTED', score: scoring.totalWeightedScore, classification: scoring.classification }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
    });
  }

  reviewWorkflow(
    actor: AuthUser,
    id: string,
    action: 'APPROVE' | 'RETURN',
    metadata: AuditRequestMetadata,
    validate: (snapshot: NonNullable<Awaited<ReturnType<EmployeeBscRepository['workflowSnapshot']>>>) => { scoring: BscScoringResult; reason: string | null },
  ) {
    return this.serializable(async (db) => {
      const snapshot = await this.workflowSnapshot(db, id);
      if (!snapshot) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
      const { scoring, reason } = validate(snapshot);
      const now = new Date();
      const targetStatus = action === 'APPROVE' ? 'APPROVED' : 'RETURNED';
      const changed = await db.employee_bsc.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: action === 'APPROVE'
          ? {
              status: targetStatus, approved_at: now, approved_by: actor.id, locked_at: now,
              manager_total_score: scoring.totalWeightedScore, final_score: scoring.totalWeightedScore,
              final_grade: scoring.classification, updated_at: now,
            }
          : {
              status: targetStatus, locked_at: null, approved_at: null, approved_by: null,
              manager_total_score: null, final_score: null, final_grade: null, updated_at: now,
            },
      });
      if (changed.count !== 1) this.workflowConflict();
      await db.bsc_status_histories.create({ data: {
        employee_bsc_id: id, from_status: 'SUBMITTED', to_status: targetStatus, action,
        comment: reason, changed_by: actor.id, changed_at: now,
        ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
      } });
      await db.bsc_approval_steps.update({
        where: { employee_bsc_id_step_order: { employee_bsc_id: id, step_order: 1 } },
        data: { status: targetStatus, comment: reason, acted_at: now },
      });
      await db.bsc_reviews.create({ data: {
        employee_bsc_id: id, reviewer_id: actor.id,
        reviewer_role: snapshot.reviewer_role,
        review_level: 1, action, score_before: snapshot.final_score,
        score_after: action === 'APPROVE' ? scoring.totalWeightedScore : null,
        comment: reason, reviewed_at: now,
      } });
      await this.audit(db, actor, action === 'APPROVE' ? 'BSC_APPROVED' : 'BSC_RETURNED', 'employee_bsc', id,
        { bscId: id, employeeId: snapshot.employee_id, status: 'SUBMITTED' },
        { bscId: id, employeeId: snapshot.employee_id, status: targetStatus, reason, score: scoring.totalWeightedScore, classification: scoring.classification }, metadata);
      return db.employee_bsc.findUniqueOrThrow({ where: { id }, select: bscDetailSelect });
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
    return this.prisma.$transaction(async (db) => {
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
    return this.prisma.$transaction(async (db) => {
      const current = await db.employee_bsc.findUniqueOrThrow({ where: { id }, select: { employee_comment: true, status: true } });
      if (!['DRAFT', 'RETURNED'].includes(current.status)) throw new ForbiddenException({ code: 'BSC_NOT_DRAFT', message: 'Chỉ BSC nháp hoặc bị trả lại mới được chỉnh sửa.' });
      const bsc = await db.employee_bsc.update({ where: { id }, data: { employee_comment: comment, updated_at: new Date() }, select: bscDetailSelect });
      await this.audit(db, actor, 'BSC_UPDATED', 'employee_bsc', id, { employeeComment: current.employee_comment }, { employeeComment: bsc.employee_comment }, metadata);
      return bsc;
    });
  }

  async deleteDraft(actor: AuthUser, bsc: { id: string; employee_id: string; cycle_id?: string }, metadata: AuditRequestMetadata) {
    await this.prisma.$transaction(async (db) => {
      const current = await db.employee_bsc.findUniqueOrThrow({ where: { id: bsc.id }, select: { status: true } });
      if (current.status !== 'DRAFT') throw new ForbiddenException({ code: 'BSC_NOT_DRAFT', message: 'Chỉ BSC nháp mới được xóa.' });
      const itemCount = await db.employee_bsc_items.count({ where: { employee_bsc_id: bsc.id } });
      await db.employee_bsc.delete({ where: { id: bsc.id } });
      await this.audit(db, actor, 'BSC_DELETED', 'employee_bsc', bsc.id, { bscId: bsc.id, employeeId: bsc.employee_id, cycleId: bsc.cycle_id, itemCount }, null, metadata);
    });
  }

  createItem(actor: AuthUser, bscId: string, dto: CreateBscItemDto, metadata: AuditRequestMetadata) {
    return this.serializable(async (db) => {
      await this.assertEditableInTransaction(db, bscId);
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
      await this.assertEditableInTransaction(db, bscId);
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
    return this.prisma.$transaction(async (db) => {
      await this.assertEditableInTransaction(db, bscId);
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
      await this.assertEditableInTransaction(db, bscId);
      const old = await this.requireItemInBsc(db, bscId, itemId);
      await db.employee_bsc_items.delete({ where: { id: itemId } });
      await this.audit(db, actor, 'BSC_ITEM_DELETED', 'employee_bsc_item', itemId, this.itemAudit(old), null, metadata);
      return { success: true };
    });
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
      id: true, employee_id: true, department_id: true, direct_manager_id: true, status: true, final_score: true,
      bsc_cycles: { select: { status: true, submission_deadline: true } },
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
      employee_bsc_items: { select: { id: true, calculation_method: true, target_value: true, actual_value: true, weight: true } },
    } }).then((bsc) => bsc ? ({
      id: bsc.id, employee_id: bsc.employee_id, department_id: bsc.department_id,
      direct_manager_id: bsc.direct_manager_id, status: bsc.status, final_score: bsc.final_score,
      cycle_status: bsc.bsc_cycles.status, submission_deadline: bsc.bsc_cycles.submission_deadline,
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

  private workflowConflict(): never {
    throw new ConflictException({ code: 'BSC_WORKFLOW_CONFLICT', message: 'Trạng thái BSC vừa được thay đổi bởi yêu cầu khác.' });
  }

  private async assertEditableInTransaction(db: Transaction, bscId: string): Promise<void> {
    const bsc = await db.employee_bsc.findUniqueOrThrow({ where: { id: bscId }, select: { status: true } });
    if (!['DRAFT', 'RETURNED'].includes(bsc.status)) {
      throw new ForbiddenException({ code: 'BSC_NOT_DRAFT', message: 'Chỉ BSC nháp hoặc bị trả lại mới được chỉnh sửa.' });
    }
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
