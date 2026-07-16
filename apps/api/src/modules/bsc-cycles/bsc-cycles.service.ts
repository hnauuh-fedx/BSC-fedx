import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { BSC_PERMISSIONS } from '../employee-bsc/policies/bsc-access.policy';
import { BSC_CYCLE_PERMISSIONS, BscCyclePolicy, BscCycleStatus, CycleTiming } from './bsc-cycle.policy';
import { CreateBscCycleDto, QueryBscCycleDto, UpdateBscCycleDto } from './dto/bsc-cycle.dto';
import { BscCyclePage, BscCycleResponse, BscCycleSummary } from './bsc-cycles.types';

const cycleSelect = {
  id: true, code: true, name: true, cycle_type: true, year: true, month: true, quarter: true,
  start_date: true, end_date: true, submission_deadline: true, review_deadline: true,
  status: true, version: true, created_at: true, updated_at: true,
  users: { select: { id: true, employee_code: true, full_name: true } },
  _count: { select: { employee_bsc: true } },
} as const;

type CycleRecord = Prisma.bsc_cyclesGetPayload<{ select: typeof cycleSelect }>;

@Injectable()
export class BscCyclesService {
  constructor(private readonly prisma: PrismaService, private readonly policy: BscCyclePolicy) {}

  async findAll(actor: AuthUser, query: QueryBscCycleDto): Promise<BscCyclePage> {
    this.assertGlobalPermission(actor, BSC_CYCLE_PERMISSIONS.VIEW);
    const where: Prisma.bsc_cyclesWhereInput = {
      ...(query.search ? { OR: [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.cycleType ? { cycle_type: query.cycleType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const orderBy = [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }] as Prisma.bsc_cyclesOrderByWithRelationInput[];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bsc_cycles.findMany({ where, select: cycleSelect, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.bsc_cycles.count({ where }),
    ]);
    return { items: rows.map((row) => this.toResponse(row, { totalBsc: row._count.employee_bsc })), page: query.page, limit: query.limit, total };
  }

  async findOpen(actor: AuthUser) {
    if (!await this.isEligibleForOpenCycles(actor)) return [];
    const cycles = await this.prisma.bsc_cycles.findMany({
      where: { status: 'OPEN', cycle_type: 'MONTH' },
      select: cycleSelect,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { quarter: 'desc' }, { start_date: 'desc' }, { id: 'asc' }],
    });
    return cycles.map((row) => ({
      id: row.id,
      name: row.name,
      year: row.year,
      month: row.month,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
    }));
  }

  async findOne(actor: AuthUser, id: string): Promise<BscCycleResponse> {
    const canReadBusinessCycle = [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN,
      BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT].some((permission) => actor.permissions.includes(permission));
    const canManage = this.hasGlobalPermission(actor, BSC_CYCLE_PERMISSIONS.VIEW)
      || this.hasGlobalPermission(actor, BSC_CYCLE_PERMISSIONS.MANAGE);
    if (!canReadBusinessCycle && !canManage) this.deny();
    const cycle = await this.prisma.bsc_cycles.findUnique({ where: { id }, select: cycleSelect });
    if (!cycle) this.notFound();
    const summary = canManage ? await this.summary(id) : undefined;
    return this.toResponse(cycle, summary);
  }

  async create(actor: AuthUser, dto: CreateBscCycleDto, metadata: AuditRequestMetadata): Promise<BscCycleResponse> {
    this.policy.assertCanManageCycle(actor);
    this.assertPeriodShape(dto.cycleType, dto.month);
    const timing = this.timingFromDto(dto, 'DRAFT');
    this.policy.assertValidTimeline(timing);
    try {
      return await this.prisma.$transaction(async (db) => {
        const cycle = await db.bsc_cycles.create({ data: {
          code: dto.code.toUpperCase(), name: dto.name, cycle_type: dto.cycleType, year: dto.year,
          month: dto.month,
          quarter: null,
          start_date: this.dateOnly(dto.startDate), end_date: this.dateOnly(dto.endDate),
          submission_deadline: new Date(dto.evaluationSubmissionDeadline),
          review_deadline: null,
          status: 'DRAFT', created_by: actor.id,
        }, select: cycleSelect });
        await this.audit(db, actor, 'BSC_CYCLE_CREATED', cycle.id, null, this.auditData(cycle), metadata);
        return this.toResponse(cycle, { totalBsc: 0 });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'BSC_CYCLE_CODE_EXISTS', message: 'Mã kỳ BSC đã tồn tại.' });
      }
      throw error;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateBscCycleDto, metadata: AuditRequestMetadata): Promise<BscCycleResponse> {
    this.policy.assertCanManageCycle(actor);
    if (Object.keys(dto).every((key) => key === 'expectedVersion')) {
      throw new BadRequestException({ code: 'BSC_CYCLE_NO_CHANGES', message: 'Không có nội dung kỳ BSC cần cập nhật.' });
    }
    try {
      return await this.prisma.$transaction(async (db) => {
        const current = await db.bsc_cycles.findUnique({ where: { id }, select: cycleSelect });
        if (!current) this.notFound();
        if (!['DRAFT', 'OPEN'].includes(current.status)) {
          throw new ConflictException({ code: 'BSC_CYCLE_NOT_EDITABLE', message: 'Chỉ được sửa kỳ nháp hoặc kỳ đang mở.' });
        }
        if ((current.status !== 'DRAFT' || current._count.employee_bsc > 0) && this.hasIdentityChange(current, dto)) {
          throw new ConflictException({ code: 'BSC_CYCLE_IDENTITY_LOCKED', message: 'Không thể đổi loại, kỳ hoặc khoảng ngày sau khi kỳ đã mở hay đã có BSC.' });
        }
        const nextType = dto.cycleType ?? current.cycle_type;
        const nextMonth = nextType === 'MONTH'
          ? dto.month ?? (current.cycle_type === 'MONTH' ? current.month ?? undefined : undefined)
          : undefined;
        this.assertPeriodShape(nextType, nextMonth, undefined);
        const timing = this.mergeTiming(current, dto);
        this.policy.assertValidTimeline(timing);
        const changed = await db.bsc_cycles.updateMany({
          where: { id, status: current.status, version: dto.expectedVersion },
          data: {
            ...(dto.code !== undefined ? { code: dto.code.toUpperCase() } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.cycleType !== undefined ? { cycle_type: dto.cycleType } : {}),
            ...(dto.year !== undefined ? { year: dto.year } : {}),
            ...(dto.cycleType !== undefined || dto.month !== undefined ? { month: nextType === 'MONTH' ? nextMonth : null } : {}),
            ...(dto.cycleType !== undefined ? { quarter: null } : {}),
            ...(dto.startDate !== undefined ? { start_date: this.dateOnly(dto.startDate) } : {}),
            ...(dto.endDate !== undefined ? { end_date: this.dateOnly(dto.endDate) } : {}),
            ...(dto.evaluationSubmissionDeadline !== undefined ? {
              submission_deadline: new Date(dto.evaluationSubmissionDeadline),
            } : {}),
            version: { increment: 1 }, updated_at: new Date(),
          },
        });
        if (changed.count !== 1) this.stale();
        const updated = await db.bsc_cycles.findUniqueOrThrow({ where: { id }, select: cycleSelect });
        await this.audit(db, actor, 'BSC_CYCLE_UPDATED', id, this.auditData(current), this.auditData(updated), metadata);
        return this.toResponse(updated, { totalBsc: updated._count.employee_bsc });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'BSC_CYCLE_CODE_EXISTS', message: 'Mã kỳ BSC đã tồn tại.' });
      }
      if ((error as { code?: string }).code === 'P2034') this.stale();
      throw error;
    }
  }

  async transition(actor: AuthUser, id: string, target: BscCycleStatus, expectedVersion: number,
    metadata: AuditRequestMetadata, reason?: string): Promise<BscCycleResponse> {
    try {
      return await this.prisma.$transaction(async (db) => {
        const current = await db.bsc_cycles.findUnique({ where: { id }, select: cycleSelect });
        if (!current) this.notFound();
        this.policy.assertCanTransitionCycle(actor, current.status, target);
        const unlocking = current.status === 'LOCKED' && target === 'OPEN';
        if (unlocking && !reason?.trim()) {
          throw new BadRequestException({ code: 'BSC_CYCLE_UNLOCK_REASON_REQUIRED', message: 'Phải nhập lý do mở lại kỳ BSC.' });
        }
        if (target === 'OPEN') this.policy.assertValidTimeline(this.toTiming(current));
        const changed = await db.bsc_cycles.updateMany({
          where: { id, status: current.status, version: expectedVersion },
          data: { status: target, version: { increment: 1 }, updated_at: new Date() },
        });
        if (changed.count !== 1) this.stale();
        const updated = await db.bsc_cycles.findUniqueOrThrow({ where: { id }, select: cycleSelect });
        await this.audit(db, actor, unlocking ? 'BSC_CYCLE_UNLOCKED' : `BSC_CYCLE_${target}`, id,
          { status: current.status, version: current.version },
          { status: updated.status, version: updated.version, ...(reason ? { reason: reason.trim() } : {}) }, metadata);
        return this.toResponse(updated, { totalBsc: updated._count.employee_bsc });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') this.stale();
      throw error;
    }
  }

  private async summary(cycleId: string): Promise<BscCycleSummary> {
    const now = new Date();
    const [totalBsc, planGroups, evaluationGroups, eligibleOwners] = await Promise.all([
      this.prisma.employee_bsc.count({ where: { cycle_id: cycleId } }),
      this.prisma.employee_bsc.groupBy({ by: ['plan_status'], where: { cycle_id: cycleId },
        orderBy: { plan_status: 'asc' }, _count: { id: true } }),
      this.prisma.employee_bsc.groupBy({ by: ['evaluation_status'], where: { cycle_id: cycleId },
        orderBy: { evaluation_status: 'asc' }, _count: { id: true } }),
      this.prisma.users.count({ where: {
        status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' },
        user_roles_user_roles_user_idTousers: { some: {
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
          roles: { status: 'ACTIVE', code: { in: ['MANAGER', 'EMPLOYEE'] } },
        } },
      } }),
    ]);
    const plan = new Map(planGroups.map((group) => [group.plan_status, group._count.id]));
    const evaluation = new Map(evaluationGroups.map((group) => [group.evaluation_status, group._count.id]));
    return {
      totalBsc,
      notCreated: Math.max(eligibleOwners - totalBsc, 0),
      draft: plan.get('DRAFT') ?? 0,
      planSubmitted: plan.get('SUBMITTED') ?? 0,
      planReturned: plan.get('RETURNED') ?? 0,
      planApproved: plan.get('APPROVED') ?? 0,
      evaluating: (evaluation.get('DRAFT') ?? 0) + (evaluation.get('REOPENED') ?? 0),
      evaluationSubmitted: evaluation.get('SUBMITTED') ?? 0,
      evaluationReturned: evaluation.get('RETURNED') ?? 0,
      evaluationApproved: evaluation.get('APPROVED') ?? 0,
    };
  }

  private async isEligibleForOpenCycles(actor: AuthUser): Promise<boolean> {
    const canView = [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT]
      .some((permission) => actor.permissions.includes(permission));
    if (canView) return true;
    if (!actor.permissions.includes(BSC_PERMISSIONS.CREATE_OWN)) return false;
    const owner = await this.prisma.users.findUnique({ where: { id: actor.id }, select: {
      status: true, deleted_at: true, direct_manager_id: true,
      departments: { select: { status: true } }, positions: { select: { status: true } },
      users: { select: { status: true, deleted_at: true } },
    } });
    return Boolean(owner && owner.status === 'ACTIVE' && !owner.deleted_at
      && owner.departments.status === 'ACTIVE' && owner.positions.status === 'ACTIVE'
      && owner.direct_manager_id && owner.users?.status === 'ACTIVE' && !owner.users.deleted_at);
  }

  private timingFromDto(dto: CreateBscCycleDto, status: string): CycleTiming {
    return {
      status, startDate: this.dateOnly(dto.startDate), endDate: this.dateOnly(dto.endDate),
      submissionDeadline: new Date(dto.evaluationSubmissionDeadline),
    };
  }

  private mergeTiming(current: CycleRecord, dto: UpdateBscCycleDto): CycleTiming {
    return {
      status: current.status,
      startDate: dto.startDate ? this.dateOnly(dto.startDate) : current.start_date,
      endDate: dto.endDate ? this.dateOnly(dto.endDate) : current.end_date,
      submissionDeadline: dto.evaluationSubmissionDeadline ? new Date(dto.evaluationSubmissionDeadline) : current.submission_deadline,
    };
  }

  private toTiming(cycle: CycleRecord): CycleTiming {
    return {
      status: cycle.status, startDate: cycle.start_date, endDate: cycle.end_date,
      submissionDeadline: cycle.submission_deadline,
    };
  }

  private hasIdentityChange(current: CycleRecord, dto: UpdateBscCycleDto): boolean {
    return (dto.code !== undefined && dto.code.toUpperCase() !== current.code)
      || (dto.cycleType !== undefined && dto.cycleType !== current.cycle_type)
      || (dto.year !== undefined && dto.year !== current.year)
      || (dto.month !== undefined && dto.month !== current.month)
      || (dto.startDate !== undefined && this.dateOnly(dto.startDate).getTime() !== current.start_date.getTime())
      || (dto.endDate !== undefined && this.dateOnly(dto.endDate).getTime() !== current.end_date.getTime());
  }

  private toResponse(cycle: CycleRecord, summary?: Partial<BscCycleSummary>): BscCycleResponse {
    return {
      id: cycle.id, code: cycle.code, name: cycle.name, cycleType: cycle.cycle_type,
      year: cycle.year, month: cycle.month, quarter: cycle.quarter, status: cycle.status, version: cycle.version,
      startDate: cycle.start_date, endDate: cycle.end_date,
      evaluationSubmissionDeadline: cycle.submission_deadline,
      createdAt: cycle.created_at, updatedAt: cycle.updated_at,
      createdBy: { id: cycle.users.id, employeeCode: cycle.users.employee_code, fullName: cycle.users.full_name },
      ...(summary ? { summary: {
        totalBsc: summary.totalBsc ?? cycle._count.employee_bsc,
        notCreated: summary.notCreated ?? 0, draft: summary.draft ?? 0,
        planSubmitted: summary.planSubmitted ?? 0, planReturned: summary.planReturned ?? 0,
        planApproved: summary.planApproved ?? 0, evaluating: summary.evaluating ?? 0,
        evaluationSubmitted: summary.evaluationSubmitted ?? 0, evaluationReturned: summary.evaluationReturned ?? 0,
        evaluationApproved: summary.evaluationApproved ?? 0,
      } } : {}),
    };
  }

  private auditData(cycle: CycleRecord) {
    return {
      code: cycle.code, name: cycle.name, cycleType: cycle.cycle_type, year: cycle.year,
      month: cycle.month, quarter: cycle.quarter, status: cycle.status, version: cycle.version,
      startDate: cycle.start_date, endDate: cycle.end_date,
      evaluationSubmissionDeadline: cycle.submission_deadline,
    };
  }

  private audit(db: Prisma.TransactionClient, actor: AuthUser, action: string, cycleId: string,
    oldData: unknown, newData: unknown, metadata: AuditRequestMetadata) {
    const actorContext = actor.roles.map((role) => ({ code: role.code, scopeType: role.scopeType, scopeId: role.scopeId }));
    const contextualNewData = newData === null ? null
      : typeof newData === 'object' && !Array.isArray(newData) ? { ...newData, actorRoles: actorContext }
        : { value: newData, actorRoles: actorContext };
    return db.audit_logs.create({ data: {
      user_id: actor.id, module: 'bsc-cycles', entity_type: 'bsc_cycle', entity_id: cycleId, action,
      old_data: oldData === null ? Prisma.JsonNull : oldData as Prisma.InputJsonValue,
      new_data: contextualNewData === null ? Prisma.JsonNull : contextualNewData as Prisma.InputJsonValue,
      ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
    } });
  }

  private assertPeriodShape(type: string, month?: number, quarter?: number): void {
    const valid = type === 'MONTH' && month !== undefined && quarter === undefined;
    if (!valid) throw new BadRequestException({
      code: 'BSC_CYCLE_PERIOD_INVALID',
      message: 'Phase hiện tại chỉ hỗ trợ kỳ BSC theo tháng.',
    });
  }

  private hasGlobalPermission(actor: AuthUser, permission: string): boolean {
    return actor.roles.some((role) => role.scopeType === 'GLOBAL' && role.permissions?.includes(permission));
  }

  private assertGlobalPermission(actor: AuthUser, permission: string): void {
    if (!this.hasGlobalPermission(actor, permission) && !this.hasGlobalPermission(actor, BSC_CYCLE_PERMISSIONS.MANAGE)) this.deny();
  }

  private dateOnly(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private notFound(): never { throw new NotFoundException({ code: 'BSC_CYCLE_NOT_FOUND', message: 'Không tìm thấy kỳ BSC.' }); }
  private stale(): never { throw new ConflictException({ code: 'BSC_CYCLE_STALE', message: 'Kỳ BSC đã thay đổi; vui lòng tải lại dữ liệu.' }); }
  private deny(): never { throw new ForbiddenException({ code: 'BSC_CYCLE_ACCESS_DENIED', message: 'Bạn không có quyền quản lý kỳ BSC.' }); }
}
