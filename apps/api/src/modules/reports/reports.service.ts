import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { BSC_REPORT_EXPORT_LIMIT, BSC_REPORT_PERMISSIONS, BSC_REPORT_VIEW_PERMISSIONS } from './reports.constants';
import { BscDashboardQueryDto, BscReportFilterDto, BscReportQueryDto } from './reports.dto';

const GRADES = ['C', 'B', 'A', 'A+', 'A++'] as const;
const PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'] as const;
const EVALUATION_STATUSES = ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'] as const;
const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu', DRAFT: 'Nháp', SUBMITTED: 'Đã nộp / Chờ duyệt',
  RETURNED: 'Trả lại chỉnh sửa', APPROVED: 'Đã duyệt', REOPENED: 'Được mở lại',
};

const reportSelect = {
  id: true, bsc_code: true, employee_id: true, department_id: true, cycle_id: true,
  plan_status: true, evaluation_status: true, final_score: true, final_grade: true,
  plan_approved_at: true, evaluation_approved_at: true, created_at: true, updated_at: true,
  users_employee_bsc_employee_idTousers: { select: { employee_code: true, full_name: true } },
  users_employee_bsc_direct_manager_idTousers: { select: { full_name: true } },
  departments: { select: { id: true, name: true } },
  positions: { select: { name: true } },
  bsc_cycles: { select: { id: true, code: true, name: true, year: true, month: true } },
} as const;

type ReportRecord = Prisma.employee_bscGetPayload<{ select: typeof reportSelect }>;
type AssignedScope = { self: boolean; global: boolean; departmentIds: string[] };
type ReportAccess = { personal: boolean; management: boolean; global: boolean; departmentIds: string[]; exportScope: AssignedScope | null };

@Injectable()
export class BscReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AuthUser, query: BscReportQueryDto) {
    const access = await this.reportAccess(actor);
    const where = await this.where(actor, query, access);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.employee_bsc.findMany({ where, select: reportSelect, orderBy: { [query.sortBy]: query.sortOrder }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.employee_bsc.count({ where }),
    ]);
    return { items: await this.rows(records), page: query.page, limit: query.limit, total };
  }

  async summary(actor: AuthUser, query: BscReportFilterDto) {
    const access = await this.reportAccess(actor);
    return this.summaryWithAccess(actor, query, access);
  }

  private async summaryWithAccess(actor: AuthUser, query: BscReportFilterDto, access: ReportAccess) {
    const where = await this.where(actor, query, access);
    const approvedWhere: Prisma.employee_bscWhereInput = { AND: [where, { evaluation_status: 'APPROVED', final_score: { not: null }, final_grade: { not: null } }] };
    const [totalBsc, planGroups, evaluationGroups, gradeGroups, average, pendingPlanReviews, pendingEvaluationReviews, pendingReopenRequests, departmentProgress] = await Promise.all([
      this.prisma.employee_bsc.count({ where }),
      this.prisma.employee_bsc.groupBy({ by: ['plan_status'], where, _count: { _all: true } }),
      this.prisma.employee_bsc.groupBy({ by: ['evaluation_status'], where, _count: { _all: true } }),
      this.prisma.employee_bsc.groupBy({ by: ['final_grade'], where: approvedWhere, _count: { _all: true } }),
      this.prisma.employee_bsc.aggregate({ where: approvedWhere, _avg: { final_score: true } }),
      this.prisma.bsc_approval_steps.count({ where: { approver_id: actor.id, stage: 'PLAN', status: 'PENDING', employee_bsc: { is: where } } }),
      this.prisma.bsc_approval_steps.count({ where: { approver_id: actor.id, stage: 'EVALUATION', status: 'PENDING', employee_bsc: { is: where } } }),
      this.prisma.bsc_unlock_requests.count({ where: { status: 'PENDING', reviewer_id: actor.id, employee_bsc: where } }),
      this.departmentProgress(where),
    ]);
    return {
      totalBsc,
      planStatusCounts: this.countMap(PLAN_STATUSES, planGroups.map(row => [row.plan_status, row._count._all])),
      evaluationStatusCounts: this.countMap(EVALUATION_STATUSES, evaluationGroups.map(row => [row.evaluation_status, row._count._all])),
      pendingPlanReviews,
      pendingEvaluationReviews,
      pendingReopenRequests,
      gradeDistribution: this.countMap(GRADES, gradeGroups.map(row => [row.final_grade ?? '', row._count._all])),
      approvedAverageScore: average._avg.final_score?.toString() ?? null,
      departmentProgress,
    };
  }

  async dashboard(actor: AuthUser, query: BscDashboardQueryDto) {
    const access = await this.reportAccess(actor);
    const cycleSelect = { id: true, code: true, name: true, year: true, month: true, status: true } as const;
    const now = new Date();
    const cycle = query.cycleId
      ? await this.prisma.bsc_cycles.findUnique({ where: { id: query.cycleId }, select: cycleSelect })
      : await this.prisma.bsc_cycles.findFirst({ where: { status: 'OPEN', start_date: { lte: now }, end_date: { gte: now } }, orderBy: { start_date: 'desc' }, select: cycleSelect })
        ?? await this.prisma.bsc_cycles.findFirst({ where: { status: 'OPEN' }, orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }], select: cycleSelect });
    if (access.personal && !access.management) {
      const [recentRecords, currentRecord] = await Promise.all([
        this.prisma.employee_bsc.findMany({ where: { employee_id: actor.id }, select: reportSelect, orderBy: { created_at: 'desc' }, take: 6 }),
        cycle ? this.prisma.employee_bsc.findFirst({ where: { employee_id: actor.id, cycle_id: cycle.id }, select: reportSelect }) : Promise.resolve(null),
      ]);
      const records = currentRecord && !recentRecords.some(record => record.id === currentRecord.id) ? [currentRecord, ...recentRecords] : recentRecords;
      const rows = await this.rows(records);
      const currentBsc = cycle ? rows.find(row => row.cycleId === cycle.id) ?? null : null;
      const actions = currentBsc ? this.ownerActions(currentBsc) : cycle ? [{ code: 'CREATE_BSC', label: 'Tạo BSC cho kỳ hiện tại', href: `/employee-bsc/new?cycleId=${cycle.id}` }] : [];
      return { kind: 'EMPLOYEE', currentCycle: cycle, currentBsc, actions, recentBsc: rows.slice(0, 6) };
    }
    if (!access.management) throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem dashboard BSC.' });
    const filter = Object.assign(new BscReportFilterDto(), cycle ? { cycleId: cycle.id } : {});
    const summary = await this.summaryWithAccess(actor, filter, access);
    return { kind: 'MANAGEMENT', currentCycle: cycle, notCreated: cycle ? await this.notCreated(actor, cycle.id, access) : 0, ...summary };
  }

  async options(actor: AuthUser) {
    const access = await this.reportAccess(actor);
    const scope = this.scopeWhere(actor, access);
    const bscs = await this.prisma.employee_bsc.findMany({ where: scope, distinct: ['employee_id'], select: { employee_id: true, department_id: true } });
    const employeeIds = bscs.map(row => row.employee_id);
    const departmentIds = [...new Set(bscs.map(row => row.department_id))];
    const [cycles, departments, employees] = await Promise.all([
      this.prisma.bsc_cycles.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], select: { id: true, code: true, name: true, year: true, month: true, status: true } }),
      this.prisma.departments.findMany({ where: { id: { in: departmentIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.users.findMany({ where: { id: { in: employeeIds } }, orderBy: { full_name: 'asc' }, select: { id: true, employee_code: true, full_name: true, department_id: true } }),
    ]);
    return { cycles, departments, employees };
  }

  async export(actor: AuthUser, query: BscReportQueryDto) {
    const access = await this.reportAccess(actor);
    if (!access.exportScope) throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xuất báo cáo BSC.' });
    if (query.departmentId) this.assertAssignedDepartmentAccess(actor, query.departmentId, access.exportScope);
    const viewWhere = await this.where(actor, query, access);
    const where: Prisma.employee_bscWhereInput = { AND: [viewWhere, this.assignedScopeWhere(actor, access.exportScope)] };
    const [total, cycle] = await Promise.all([
      this.prisma.employee_bsc.count({ where }),
      query.cycleId ? this.prisma.bsc_cycles.findUnique({ where: { id: query.cycleId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    if (total > BSC_REPORT_EXPORT_LIMIT) throw new BadRequestException({ code: 'BSC_REPORT_EXPORT_TOO_LARGE', message: `Báo cáo vượt giới hạn ${BSC_REPORT_EXPORT_LIMIT} dòng. Hãy thu hẹp bộ lọc.` });
    const records = await this.prisma.employee_bsc.findMany({ where, select: reportSelect, orderBy: { [query.sortBy]: query.sortOrder }, take: BSC_REPORT_EXPORT_LIMIT });
    const rows = await this.rows(records);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BSC Management'; workbook.created = new Date();
    const sheet = workbook.addWorksheet('BSC Report', { views: [{ state: 'frozen', ySplit: 5 }] });
    sheet.mergeCells('A1:N1'); sheet.getCell('A1').value = 'BÁO CÁO TỔNG HỢP BSC'; sheet.getCell('A1').font = { bold: true, size: 16 };
    sheet.mergeCells('A2:N2'); sheet.getCell('A2').value = `Kỳ: ${cycle?.name ?? 'Tất cả kỳ'}`;
    sheet.mergeCells('A3:N3'); sheet.getCell('A3').value = `Thời gian xuất: ${new Date().toISOString()}`;
    const headers = ['Mã nhân viên', 'Họ tên', 'Phòng ban', 'Chức danh', 'Quản lý trực tiếp', 'Kỳ BSC', 'PLAN status', 'EVALUATION status', 'Tổng tỷ trọng', 'Số KPI', 'Final score', 'Final grade', 'Ngày duyệt PLAN', 'Ngày duyệt EVALUATION'];
    const header = sheet.addRow([]); const headerRow = sheet.addRow(headers); void header;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    for (const row of rows) sheet.addRow([row.employeeCode, row.employeeName, row.departmentName, row.positionName, row.directManagerName, row.cycleName, this.statusLabel(row.planStatus), this.statusLabel(row.evaluationStatus), Number(row.totalWeight), row.kpiCount, row.officialScore === null ? null : Number(row.officialScore), row.officialGrade, row.planApprovedAt, row.evaluationApprovedAt]);
    sheet.columns = [14, 24, 22, 20, 24, 20, 18, 22, 15, 10, 14, 12, 20, 24].map(width => ({ width }));
    sheet.autoFilter = { from: 'A5', to: 'N5' };
    const bytes = await workbook.xlsx.writeBuffer();
    await this.prisma.audit_logs.create({ data: { user_id: actor.id, module: 'bsc', entity_type: 'bsc_report', action: 'BSC_REPORT_EXPORTED', new_data: { filters: this.safeFilters(query), format: 'xlsx', rowCount: rows.length, exportedAt: new Date().toISOString() } } });
    return { buffer: Buffer.from(bytes), fileName: `bsc-report-${new Date().toISOString().slice(0, 10)}.xlsx` };
  }

  private async where(actor: AuthUser, query: BscReportFilterDto, access: ReportAccess): Promise<Prisma.employee_bscWhereInput> {
    if (query.departmentId) await this.assertDepartmentAccess(actor, query.departmentId, access);
    const filters: Prisma.employee_bscWhereInput[] = [this.scopeWhere(actor, access)];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.departmentId) filters.push({ department_id: query.departmentId });
    if (query.employeeId) filters.push({ employee_id: query.employeeId });
    if (query.planStatus) filters.push({ plan_status: query.planStatus });
    if (query.evaluationStatus) filters.push({ evaluation_status: query.evaluationStatus });
    if (query.finalGrade) filters.push({ evaluation_status: 'APPROVED', final_grade: query.finalGrade });
    if (query.search?.trim()) filters.push({ users_employee_bsc_employee_idTousers: { OR: [{ employee_code: { contains: query.search.trim(), mode: 'insensitive' } }, { full_name: { contains: query.search.trim(), mode: 'insensitive' } }] } });
    return { AND: filters };
  }

  private scopeWhere(actor: AuthUser, access: ReportAccess): Prisma.employee_bscWhereInput {
    const clauses: Prisma.employee_bscWhereInput[] = [];
    if (access.personal) clauses.push({ employee_id: actor.id });
    if (access.management) {
      if (access.global) return {};
      if (access.departmentIds.length) clauses.push({ department_id: { in: access.departmentIds } });
      clauses.push({ direct_manager_id: actor.id });
    }
    if (!clauses.length) throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem báo cáo BSC.' });
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  private async rows(records: ReportRecord[]) {
    const ids = records.map(record => record.id);
    const aggregates = ids.length ? await this.prisma.employee_bsc_items.groupBy({ by: ['employee_bsc_id'], where: { employee_bsc_id: { in: ids } }, _count: { _all: true }, _sum: { weight: true } }) : [];
    const byBsc = new Map(aggregates.map(row => [row.employee_bsc_id, row]));
    return records.map(record => {
      const item = byBsc.get(record.id);
      const approved = record.evaluation_status === 'APPROVED';
      return {
        id: record.id, bscCode: record.bsc_code, employeeId: record.employee_id,
        employeeCode: record.users_employee_bsc_employee_idTousers.employee_code,
        employeeName: record.users_employee_bsc_employee_idTousers.full_name,
        departmentId: record.department_id, departmentName: record.departments.name,
        positionName: record.positions.name, directManagerName: record.users_employee_bsc_direct_manager_idTousers.full_name,
        cycleId: record.cycle_id, cycleCode: record.bsc_cycles.code, cycleName: record.bsc_cycles.name,
        planStatus: record.plan_status, evaluationStatus: record.evaluation_status,
        totalWeight: item?._sum.weight?.toString() ?? '0', kpiCount: item?._count._all ?? 0,
        officialScore: approved ? record.final_score?.toString() ?? null : null,
        officialGrade: approved ? record.final_grade : null,
        planApprovedAt: record.plan_approved_at, evaluationApprovedAt: record.evaluation_approved_at,
      };
    });
  }

  private async departmentProgress(where: Prisma.employee_bscWhereInput) {
    const [totals, approved] = await Promise.all([
      this.prisma.employee_bsc.groupBy({ by: ['department_id'], where, _count: { _all: true } }),
      this.prisma.employee_bsc.groupBy({ by: ['department_id'], where: { AND: [where, { evaluation_status: 'APPROVED' }] }, _count: { _all: true } }),
    ]);
    const names = await this.prisma.departments.findMany({ where: { id: { in: totals.map(row => row.department_id) } }, select: { id: true, name: true } });
    const nameById = new Map(names.map(row => [row.id, row.name])); const approvedById = new Map(approved.map(row => [row.department_id, row._count._all]));
    return totals.map(row => ({ departmentId: row.department_id, departmentName: nameById.get(row.department_id) ?? '', totalBsc: row._count._all, approvedBsc: approvedById.get(row.department_id) ?? 0, completionPercentage: row._count._all ? Math.round(((approvedById.get(row.department_id) ?? 0) / row._count._all) * 10_000) / 100 : 0 }));
  }

  private async notCreated(actor: AuthUser, cycleId: string, access: ReportAccess) {
    const userScope: Prisma.usersWhereInput = access.global ? {} : { OR: [{ department_id: { in: access.departmentIds } }, { direct_manager_id: actor.id }] };
    const eligible = await this.prisma.users.findMany({ where: { AND: [userScope, { status: 'ACTIVE', deleted_at: null, user_roles_user_roles_user_idTousers: { some: { roles: { code: { in: ['EMPLOYEE', 'MANAGER'] } } } } }] }, select: { id: true } });
    if (!eligible.length) return 0;
    const existing = await this.prisma.employee_bsc.findMany({ where: { cycle_id: cycleId, employee_id: { in: eligible.map(row => row.id) } }, select: { employee_id: true } });
    return eligible.length - new Set(existing.map(row => row.employee_id)).size;
  }

  private ownerActions(row: Awaited<ReturnType<BscReportsService['rows']>>[number]) {
    if (['DRAFT', 'RETURNED', 'REOPENED'].includes(row.planStatus)) return [{ code: 'COMPLETE_PLAN', label: 'Hoàn thiện và nộp PLAN', href: `/employee-bsc/${row.id}` }];
    if (row.planStatus === 'APPROVED' && ['DRAFT', 'RETURNED', 'REOPENED'].includes(row.evaluationStatus)) return [{ code: 'COMPLETE_EVALUATION', label: 'Hoàn thiện và nộp EVALUATION', href: `/employee-bsc/${row.id}` }];
    return [];
  }

  private countMap(keys: readonly string[], entries: Array<[string, number]>) { const values = Object.fromEntries(keys.map(key => [key, 0])) as Record<string, number>; for (const [key, count] of entries) if (key in values) values[key] = count; return values; }
  private async reportAccess(actor: AuthUser): Promise<ReportAccess> {
    const assignments = await this.prisma.user_roles.findMany({
      where: { user_id: actor.id, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }], roles: { status: 'ACTIVE' } },
      select: { scope_type: true, scope_id: true, roles: { select: { role_permissions: { where: { permissions: { code: { in: [...BSC_REPORT_VIEW_PERMISSIONS, BSC_REPORT_PERMISSIONS.EXPORT] } } }, select: { permissions: { select: { code: true } } } } } } },
    });
    let personal = false; let management = false; let global = false;
    const departmentIds = new Set<string>(); const exportDepartmentIds = new Set<string>();
    let canExport = false; let exportGlobal = false; let exportSelf = false;
    for (const assignment of assignments) {
      const permissions = new Set(assignment.roles.role_permissions.map(item => item.permissions.code));
      if (permissions.has(BSC_REPORT_PERMISSIONS.PERSONAL)) personal = true;
      if (permissions.has(BSC_REPORT_PERMISSIONS.UNIT) || permissions.has(BSC_REPORT_PERMISSIONS.ORGANIZATION)) {
        management = true;
        if (assignment.scope_type === 'GLOBAL') global = true;
        if (assignment.scope_type === 'DEPARTMENT' && assignment.scope_id) departmentIds.add(assignment.scope_id);
      }
      if (permissions.has(BSC_REPORT_PERMISSIONS.EXPORT)) {
        canExport = true;
        if (assignment.scope_type === 'GLOBAL') exportGlobal = true;
        if (assignment.scope_type === 'DEPARTMENT' && assignment.scope_id) exportDepartmentIds.add(assignment.scope_id);
        if (assignment.scope_type === 'SELF') exportSelf = true;
      }
    }
    if (!personal && !management) throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem báo cáo BSC.' });
    return { personal, management, global, departmentIds: [...departmentIds], exportScope: canExport ? { self: exportSelf, global: exportGlobal, departmentIds: [...exportDepartmentIds] } : null };
  }

  private assignedScopeWhere(actor: AuthUser, scope: AssignedScope): Prisma.employee_bscWhereInput {
    if (scope.global) return {};
    const clauses: Prisma.employee_bscWhereInput[] = [];
    if (scope.self) clauses.push({ employee_id: actor.id });
    if (scope.departmentIds.length) clauses.push({ department_id: { in: scope.departmentIds } });
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  private assertAssignedDepartmentAccess(actor: AuthUser, departmentId: string, scope: AssignedScope) {
    if (scope.global || scope.departmentIds.includes(departmentId) || (scope.self && actor.departmentId === departmentId)) return;
    throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Bạn không có quyền xuất dữ liệu của đơn vị này.' });
  }

  private async assertDepartmentAccess(actor: AuthUser, departmentId: string, access: ReportAccess) {
    if (access.global || access.departmentIds.includes(departmentId)) return;
    const directBsc = access.management
      ? await this.prisma.employee_bsc.count({ where: { department_id: departmentId, direct_manager_id: actor.id } })
      : 0;
    if (!directBsc && !(access.personal && actor.departmentId === departmentId)) {
      throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Bạn không có quyền truy cập đơn vị này.' });
    }
  }
  private safeFilters(query: BscReportFilterDto) { return { cycleId: query.cycleId, departmentId: query.departmentId, employeeId: query.employeeId, planStatus: query.planStatus, evaluationStatus: query.evaluationStatus, finalGrade: query.finalGrade, search: query.search?.slice(0, 100) }; }
  private statusLabel(status: string) { return WORKFLOW_STATUS_LABELS[status] ?? status; }
}
