import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { QueryBscMinutesDto, SaveBscMinutesDto } from './bsc-minutes.dto';
import { BSC_MINUTES_PERMISSIONS } from './bsc-minutes.permissions';

type Db = PrismaService | Prisma.TransactionClient;

const detailInclude = {
  bsc_cycles: { select: { id: true, code: true, name: true, year: true, month: true, status: true } },
  creator: { select: { id: true, employee_code: true, full_name: true } },
  updater: { select: { id: true, employee_code: true, full_name: true } },
} satisfies Prisma.bsc_minutesInclude;

const summarySelect = {
  id: true, cycle_id: true, minutes_number: true, secretary_name: true, version: true,
  print_count: true, pdf_export_count: true, created_at: true, updated_at: true,
  bsc_cycles: { select: { id: true, code: true, name: true, year: true, month: true, status: true } },
  creator: { select: { id: true, employee_code: true, full_name: true } },
  updater: { select: { id: true, employee_code: true, full_name: true } },
} satisfies Prisma.bsc_minutesSelect;

@Injectable()
export class BscMinutesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: QueryBscMinutesDto) {
    this.assertGlobalPermission(actor, BSC_MINUTES_PERMISSIONS.VIEW);
    const filters: Prisma.bsc_minutesWhereInput[] = [];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.search) filters.push({ OR: [
      { minutes_number: { contains: query.search, mode: 'insensitive' } },
      { subject: { contains: query.search, mode: 'insensitive' } },
      { secretary_name: { contains: query.search, mode: 'insensitive' } },
    ] });
    const where = filters.length ? { AND: filters } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bsc_minutes.findMany({ where, select: summarySelect, orderBy: [{ updated_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.bsc_minutes.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }

  async detail(actor: AuthUser, id: string) {
    this.assertGlobalPermission(actor, BSC_MINUTES_PERMISSIONS.VIEW);
    return this.requireMinutes(this.prisma, id);
  }

  async create(actor: AuthUser, dto: SaveBscMinutesDto, metadata: AuditRequestMetadata) {
    this.assertGlobalPermission(actor, BSC_MINUTES_PERMISSIONS.CREATE);
    return this.prisma.$transaction(async (db) => {
      const snapshot = await this.canonicalSnapshot(db, dto);
      const minutes = await db.bsc_minutes.create({ data: { ...this.data(actor, dto, snapshot), created_by: actor.id }, include: detailInclude });
      await this.audit(db, actor, 'BSC_MINUTES_CREATED', minutes.id, null, this.auditData(minutes), metadata);
      return minutes;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(actor: AuthUser, id: string, dto: SaveBscMinutesDto, metadata: AuditRequestMetadata) {
    this.assertGlobalPermission(actor, BSC_MINUTES_PERMISSIONS.CREATE);
    if (!dto.expectedVersion) throw new BadRequestException({ code: 'BSC_MINUTES_EXPECTED_VERSION_REQUIRED', message: 'Thiếu phiên bản biên bản cần cập nhật.' });
    return this.prisma.$transaction(async (db) => {
      const old = await this.requireMinutes(db, id);
      if (dto.cycleId !== old.cycle_id) {
        throw new BadRequestException({ code: 'BSC_MINUTES_CYCLE_IMMUTABLE', message: 'Không được đổi kỳ BSC của biên bản đã lưu.' });
      }
      const snapshot = this.updatedSnapshot(old.snapshot, dto);
      const changed = await db.bsc_minutes.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { ...this.data(actor, dto, snapshot), version: { increment: 1 }, updated_at: new Date() },
      });
      if (changed.count !== 1) throw new ConflictException({ code: 'BSC_MINUTES_VERSION_CONFLICT', message: 'Biên bản đã được cập nhật ở phiên làm việc khác. Vui lòng tải lại.' });
      const minutes = await this.requireMinutes(db, id);
      await this.audit(db, actor, 'BSC_MINUTES_UPDATED', id, this.auditData(old), this.auditData(minutes), metadata);
      return minutes;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordOutput(actor: AuthUser, id: string, type: 'PRINT' | 'PDF', metadata: AuditRequestMetadata) {
    this.assertGlobalPermission(actor, BSC_MINUTES_PERMISSIONS.CREATE);
    const now = new Date();
    return this.prisma.$transaction(async (db) => {
      const old = await this.requireMinutes(db, id);
      const minutes = await db.bsc_minutes.update({
        where: { id },
        data: type === 'PRINT'
          ? { print_count: { increment: 1 }, last_printed_at: now, updated_at: old.updated_at }
          : { pdf_export_count: { increment: 1 }, last_pdf_exported_at: now, updated_at: old.updated_at },
        include: detailInclude,
      });
      const action = type === 'PRINT' ? 'PRINT_REQUESTED' : 'PDF_EXPORTED';
      await db.bsc_minutes_events.create({ data: { minutes_id: id, action, actor_id: actor.id, ip_address: metadata.ipAddress, user_agent: metadata.userAgent } });
      await this.audit(db, actor, `BSC_MINUTES_${action}`, id, null, { type }, metadata);
      return minutes;
    });
  }

  private data(actor: AuthUser, dto: SaveBscMinutesDto, snapshot: Prisma.InputJsonValue) {
    return {
      cycle_id: dto.cycleId,
      minutes_number: dto.number,
      issue_place: dto.issuePlace,
      meeting_date: new Date(`${dto.date}T00:00:00.000Z`),
      start_time: dto.startTime,
      end_time: dto.endTime,
      meeting_location: dto.location,
      chair_name: dto.chairName,
      secretary_name: dto.secretaryName,
      absent_count: dto.absentCount,
      subject: dto.subject,
      meeting_content: dto.meetingContent,
      next_month_assignment: dto.nextMonthAssignment,
      conclusion: dto.conclusion,
      snapshot,
      updated_by: actor.id,
    };
  }

  private async canonicalSnapshot(db: Db, dto: SaveBscMinutesDto): Promise<Prisma.InputJsonValue> {
    const cycle = await db.bsc_cycles.findUnique({ where: { id: dto.cycleId }, select: { id: true } });
    if (!cycle) throw new BadRequestException({ code: 'BSC_MINUTES_INVALID_CYCLE', message: 'Kỳ BSC không tồn tại.' });
    const employeeIds = [...new Set(dto.snapshot.rows.map((row) => row.id))];
    const departmentIds = [...new Set(dto.snapshot.collectiveRows.map((row) => row.id))];
    if (employeeIds.length !== dto.snapshot.rows.length || departmentIds.length !== dto.snapshot.collectiveRows.length) {
      throw new BadRequestException({ code: 'BSC_MINUTES_DUPLICATE_SNAPSHOT_ROW', message: 'Snapshot biên bản có dòng dữ liệu trùng.' });
    }
    const [employeeBscs, departmentBscs] = await Promise.all([
      db.employee_bsc.findMany({ where: { id: { in: employeeIds }, cycle_id: dto.cycleId, evaluation_status: 'APPROVED' }, select: {
        id: true, final_score: true, final_grade: true,
        users_employee_bsc_employee_idTousers: { select: { full_name: true } },
      } }),
      db.department_bsc.findMany({ where: { id: { in: departmentIds }, cycle_id: dto.cycleId, evaluation_status: 'APPROVED' }, select: {
        id: true, total_score: true, final_score: true, final_grade: true, departments: { select: { name: true } },
      } }),
    ]);
    if (employeeBscs.length !== employeeIds.length || departmentBscs.length !== departmentIds.length) {
      throw new BadRequestException({ code: 'BSC_MINUTES_INVALID_SNAPSHOT', message: 'Biên bản chỉ được liên kết BSC đã duyệt đánh giá trong đúng kỳ.' });
    }
    const employeeById = new Map(employeeBscs.map((item) => [item.id, item]));
    const departmentById = new Map(departmentBscs.map((item) => [item.id, item]));
    return {
      rows: dto.snapshot.rows.map((row) => {
        const bsc = employeeById.get(row.id)!;
        return {
          id: row.id, employeeName: bsc.users_employee_bsc_employee_idTousers.full_name,
          selfScore: bsc.final_score?.toString() ?? null, selfGrade: bsc.final_grade,
          unitScore: row.unitScore, unitGrade: row.unitGrade, explanation: row.explanation,
        };
      }),
      collectiveRows: dto.snapshot.collectiveRows.map((row) => {
        const bsc = departmentById.get(row.id)!;
        return {
          id: row.id, departmentName: bsc.departments.name, selfScore: bsc.total_score.toString(), selfGrade: bsc.final_grade ?? '',
          unitScore: row.unitScore, unitGrade: row.unitGrade, explanation: row.explanation,
        };
      }),
    } as Prisma.InputJsonObject;
  }

  private updatedSnapshot(current: Prisma.JsonValue, dto: SaveBscMinutesDto): Prisma.InputJsonValue {
    const saved = current as unknown as {
      rows: Array<{ id: string; employeeName: string; selfScore: string | null; selfGrade: string | null }>;
      collectiveRows: Array<{ id: string; departmentName: string; selfScore: string; selfGrade: string }>;
    };
    const individualEdits = new Map(dto.snapshot.rows.map((row) => [row.id, row]));
    const collectiveEdits = new Map(dto.snapshot.collectiveRows.map((row) => [row.id, row]));
    if (individualEdits.size !== saved.rows.length || collectiveEdits.size !== saved.collectiveRows.length
      || saved.rows.some((row) => !individualEdits.has(row.id))
      || saved.collectiveRows.some((row) => !collectiveEdits.has(row.id))) {
      throw new BadRequestException({ code: 'BSC_MINUTES_SNAPSHOT_ROWS_CHANGED', message: 'Không được thêm, xóa hoặc thay BSC liên kết của biên bản đã lưu.' });
    }
    return {
      rows: saved.rows.map((row) => {
        const edit = individualEdits.get(row.id)!;
        return { ...row, unitScore: edit.unitScore, unitGrade: edit.unitGrade, explanation: edit.explanation };
      }),
      collectiveRows: saved.collectiveRows.map((row) => {
        const edit = collectiveEdits.get(row.id)!;
        return { ...row, unitScore: edit.unitScore, unitGrade: edit.unitGrade, explanation: edit.explanation };
      }),
    } as Prisma.InputJsonObject;
  }

  private async requireMinutes(db: Db, id: string) {
    const minutes = await db.bsc_minutes.findUnique({ where: { id }, include: detailInclude });
    if (!minutes) throw new NotFoundException({ code: 'BSC_MINUTES_NOT_FOUND', message: 'Không tìm thấy biên bản.' });
    return minutes;
  }

  private assertGlobalPermission(actor: AuthUser, permission: string) {
    if (!actor.roles.some((role) => role.scopeType === 'GLOBAL' && role.permissions?.includes(permission))) {
      throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Biên bản BSC yêu cầu phạm vi toàn hệ thống.' });
    }
  }

  private auditData(minutes: object) {
    return JSON.parse(JSON.stringify(minutes, (_key, value) => value instanceof Date ? value.toISOString() : value));
  }

  private audit(db: Db, actor: AuthUser, action: string, id: string, oldData: unknown, newData: unknown, metadata: AuditRequestMetadata) {
    return db.audit_logs.create({ data: {
      user_id: actor.id, module: 'bsc-minutes', entity_type: 'bsc_minutes', entity_id: id, action,
      old_data: oldData === null ? Prisma.JsonNull : { value: oldData, actorRoles: actor.roles } as unknown as Prisma.InputJsonValue,
      new_data: newData === null ? Prisma.JsonNull : { value: newData, actorRoles: actor.roles } as unknown as Prisma.InputJsonValue,
      ip_address: metadata.ipAddress, user_agent: metadata.userAgent,
    } });
  }
}
