import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/types/auth-user.type';
import { CreateBscItemDto, UpdateBscActualDto, UpdateBscItemDto } from '../dto/bsc-item.dto';
import { CreateEmployeeBscDto } from '../dto/create-employee-bsc.dto';
import { QueryEmployeeBscDto } from '../dto/query-employee-bsc.dto';
import { UpdateEmployeeBscDto } from '../dto/update-employee-bsc.dto';
import { AuditRequestMetadata } from '../employee-bsc.types';
import { BSC_PERMISSIONS, BscAccessPolicy } from '../policies/bsc-access.policy';
import { EmployeeBscRepository } from '../repositories/employee-bsc.repository';
import { assertBinaryActual, assertTargetCompatible, assertValidWeight } from '../validators/bsc-item.validator';
import { BscScoringService } from './bsc-scoring.service';
import { BscWorkflowService } from './bsc-workflow.service';

@Injectable()
export class EmployeeBscService {
  constructor(
    private readonly repository: EmployeeBscRepository,
    private readonly policy: BscAccessPolicy,
    private readonly scoring: BscScoringService,
    private readonly workflow: BscWorkflowService,
  ) {}

  async create(actor: AuthUser, dto: CreateEmployeeBscDto, metadata: AuditRequestMetadata) {
    this.policy.assertCanCreateOwn(actor);
    const [employee, cycle] = await Promise.all([
      this.repository.findEmployeeContext(actor.id),
      this.repository.findCycle(dto.cycleId),
    ]);
    if (!employee || employee.deleted_at || employee.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'BSC_OWNER_REQUIRED', message: 'Chủ sở hữu BSC phải đang hoạt động.' });
    }
    if (!cycle) throw new NotFoundException({ code: 'BSC_CYCLE_NOT_FOUND', message: 'Không tìm thấy kỳ BSC.' });
    if (cycle.status !== 'OPEN') throw new BadRequestException({ code: 'BSC_CYCLE_NOT_OPEN', message: 'Kỳ BSC chưa mở hoặc đã đóng.' });
    if (employee.departments.status !== 'ACTIVE' || employee.positions.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'BSC_OWNER_ORGANIZATION_INACTIVE', message: 'Đơn vị và chức danh của người lập phải đang hoạt động.' });
    }
    if (!employee.direct_manager_id || !employee.users || employee.users.status !== 'ACTIVE' || employee.users.deleted_at) {
      throw new BadRequestException({ code: 'BSC_MANAGER_REQUIRED', message: 'Không xác định được quản lý trực tiếp đang hoạt động.' });
    }
    try {
      return await this.repository.createDraft({
        actor,
        cycleId: cycle.id,
        employeeCode: employee.employee_code,
        departmentId: employee.department_id,
        positionId: employee.position_id,
        managerId: employee.direct_manager_id,
        metadata,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'BSC_ALREADY_EXISTS_FOR_CYCLE', message: 'Người dùng đã có BSC trong kỳ này.' });
      }
      throw error;
    }
  }

  findAll(actor: AuthUser, query: QueryEmployeeBscDto) {
    const access = this.listAccessWhere(actor);
    if (query.departmentId && !this.canUseDepartmentFilter(actor, query.departmentId)) {
      throw new BadRequestException({ code: 'BSC_ACCESS_DENIED', message: 'Không thể lọc ngoài phạm vi được cấp.' });
    }
    const filters: Prisma.employee_bscWhereInput[] = [access];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.employeeId) filters.push({ employee_id: query.employeeId });
    if (query.departmentId) filters.push({ department_id: query.departmentId });
    if (query.planStatus) filters.push({ plan_status: query.planStatus });
    if (query.evaluationStatus) filters.push({ evaluation_status: query.evaluationStatus });
    if (query.search) filters.push({ OR: [
      { bsc_code: { contains: query.search, mode: 'insensitive' } },
      { users_employee_bsc_employee_idTousers: { full_name: { contains: query.search, mode: 'insensitive' } } },
      { users_employee_bsc_employee_idTousers: { employee_code: { contains: query.search, mode: 'insensitive' } } },
    ] });
    return this.repository.findAll({ AND: filters }, query);
  }

  async pendingReview(actor: AuthUser, query: QueryEmployeeBscDto) {
    if (!query.stage) throw new BadRequestException({ code: 'BSC_REVIEW_STAGE_REQUIRED', message: 'Phải chọn giai đoạn PLAN hoặc EVALUATION.' });
    const approvePermission = query.stage === 'PLAN' ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE;
    const returnPermission = query.stage === 'PLAN' ? BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE;
    if (!actor.permissions.includes(approvePermission) && !actor.permissions.includes(returnPermission)) {
      throw new BadRequestException({ code: 'BSC_ACCESS_DENIED', message: 'Không có quyền xử lý BSC chờ duyệt.' });
    }
    if (query.departmentId && !this.canUseDepartmentFilter(actor, query.departmentId)) {
      throw new BadRequestException({ code: 'BSC_ACCESS_DENIED', message: 'Không thể lọc ngoài phạm vi được cấp.' });
    }
    const scopedDepartments = actor.roles
      .filter((role) => role.scopeType === 'DEPARTMENT' && role.scopeId)
      .map((role) => role.scopeId!);
    const pendingStatus: Prisma.employee_bscWhereInput = query.stage === 'PLAN'
      ? { plan_status: 'SUBMITTED' }
      : { evaluation_status: 'SUBMITTED', plan_status: 'APPROVED' };
    const access: Prisma.employee_bscWhereInput = actor.roles.some((role) => role.scopeType === 'GLOBAL')
      ? { direct_manager_id: actor.id, ...pendingStatus }
      : scopedDepartments.length
        ? { direct_manager_id: actor.id, department_id: { in: scopedDepartments }, ...pendingStatus }
        : { id: { equals: '00000000-0000-0000-0000-000000000000' } };
    const filters: Prisma.employee_bscWhereInput[] = [access];
    if (query.cycleId) filters.push({ cycle_id: query.cycleId });
    if (query.departmentId) filters.push({ department_id: query.departmentId });
    if (query.search) filters.push({ OR: [
      { bsc_code: { contains: query.search, mode: 'insensitive' } },
      { users_employee_bsc_employee_idTousers: { full_name: { contains: query.search, mode: 'insensitive' } } },
      { users_employee_bsc_employee_idTousers: { employee_code: { contains: query.search, mode: 'insensitive' } } },
    ] });
    const [result, filterOptions] = await Promise.all([
      this.repository.findAll({ AND: filters }, query),
      this.repository.findReviewFilterOptions(access),
    ]);
    return { ...result, filterOptions };
  }

  async findOne(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(id);
    this.policy.assertCanView(actor, bsc);
    const visibleStages = new Set<string>();
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_PLAN_HISTORY)) visibleStages.add('PLAN');
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY)) visibleStages.add('EVALUATION');
    return { ...bsc, bsc_status_histories: bsc.bsc_status_histories.filter((history) => visibleStages.has(history.stage)) };
  }

  async scoringPreview(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(id);
    this.policy.assertCanView(actor, bsc);
    const result = this.scoring.scoreBsc(bsc.employee_bsc_items.map((item) => ({
      itemId: item.id,
      calculationMethod: item.calculation_method,
      targetValue: item.target_value,
      actualValue: item.actual_value,
      weight: item.weight,
    })));
    const { canonicalTotalWeightedScore: _canonicalTotalWeightedScore, ...preview } = result;
    return { bscId: bsc.id, planStatus: bsc.plan_status, evaluationStatus: bsc.evaluation_status, ...preview };
  }

  submitPlan(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    return this.repository.submitPlanWorkflow(actor, id, metadata, (snapshot) => {
      this.workflow.assertCanSubmitPlan(actor, this.workflowContext(snapshot), this.planDefinition(snapshot));
    });
  }

  approvePlan(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    return this.reviewPlan(actor, id, 'APPROVE_PLAN', undefined, metadata);
  }

  returnPlan(actor: AuthUser, id: string, reason: string, metadata: AuditRequestMetadata) {
    return this.reviewPlan(actor, id, 'RETURN_PLAN', reason, metadata);
  }

  submitEvaluation(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    return this.repository.submitEvaluationWorkflow(actor, id, metadata, (snapshot) => {
      const result = this.scoreSnapshot(snapshot);
      this.workflow.assertCanSubmitEvaluation(actor, this.workflowContext(snapshot), result);
      return result;
    });
  }

  approveEvaluation(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    return this.reviewEvaluation(actor, id, 'APPROVE_EVALUATION', undefined, metadata);
  }

  returnEvaluation(actor: AuthUser, id: string, reason: string, metadata: AuditRequestMetadata) {
    return this.reviewEvaluation(actor, id, 'RETURN_EVALUATION', reason, metadata);
  }

  async update(actor: AuthUser, id: string, dto: UpdateEmployeeBscDto, metadata: AuditRequestMetadata) {
    if (dto.employeeComment === undefined) this.noEditableFields();
    const bsc = await this.requireBsc(id);
    this.policy.assertCanUpdateOwn(actor, bsc);
    return this.repository.updateDraftComment(actor, id, dto.employeeComment, metadata);
  }

  async delete(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    this.policy.assertCanDeleteOwn(actor, bsc);
    await this.repository.deleteDraft(actor, bsc, metadata);
    return { success: true };
  }

  async createItem(actor: AuthUser, bscId: string, dto: CreateBscItemDto, metadata: AuditRequestMetadata) {
    assertValidWeight(dto.weight);
    assertTargetCompatible(dto.calculationMethod, dto.targetValue);
    const bsc = await this.requireBsc(bscId);
    this.policy.assertCanManageKpi(actor, bsc);
    try {
      return await this.repository.createItem(actor, bscId, dto, metadata);
    } catch (error) {
      this.mapItemMutationError(error);
    }
  }

  async updateItem(actor: AuthUser, bscId: string, itemId: string, dto: UpdateBscItemDto, metadata: AuditRequestMetadata) {
    if (!Object.keys(dto).length) this.noEditableFields();
    if (dto.weight !== undefined) assertValidWeight(dto.weight);
    const [bsc, existingItem] = await Promise.all([this.requireBsc(bscId), this.requireItemInBsc(bscId, itemId)]);
    this.policy.assertCanManageKpi(actor, bsc);
    const calculationMethod = dto.calculationMethod ?? existingItem.calculation_method;
    assertTargetCompatible(calculationMethod, dto.targetValue ?? (existingItem.target_value === null ? undefined : Number(existingItem.target_value)));
    assertBinaryActual(calculationMethod, existingItem.actual_value === null ? undefined : Number(existingItem.actual_value));
    try {
      return await this.repository.updateItem(actor, bscId, itemId, dto, metadata);
    } catch (error) {
      this.mapItemMutationError(error);
    }
  }

  async updateActual(actor: AuthUser, bscId: string, itemId: string, dto: UpdateBscActualDto, metadata: AuditRequestMetadata) {
    if (!Object.keys(dto).length) this.noEditableFields();
    const [bsc, item] = await Promise.all([this.requireBsc(bscId), this.requireItemInBsc(bscId, itemId)]);
    this.policy.assertCanUpdateActual(actor, bsc);
    assertBinaryActual(item.calculation_method, dto.actualValue);
    return this.repository.updateActual(actor, bscId, itemId, dto, metadata);
  }

  async deleteItem(actor: AuthUser, bscId: string, itemId: string, metadata: AuditRequestMetadata) {
    const [bsc] = await Promise.all([this.requireBsc(bscId), this.requireItemInBsc(bscId, itemId)]);
    this.policy.assertCanManageKpi(actor, bsc);
    return this.repository.deleteItem(actor, bscId, itemId, metadata);
  }

  private async requireBsc(id: string) {
    const bsc = await this.repository.findById(id);
    if (!bsc) throw new NotFoundException({ code: 'BSC_NOT_FOUND', message: 'Không tìm thấy BSC.' });
    return bsc;
  }

  private async requireItemInBsc(bscId: string, itemId: string) {
    const item = await this.repository.findItemById(itemId);
    if (!item) throw new NotFoundException({ code: 'BSC_ITEM_NOT_FOUND', message: 'Không tìm thấy KPI.' });
    if (item.employee_bsc_id !== bscId) throw new NotFoundException({ code: 'BSC_ITEM_NOT_IN_BSC', message: 'KPI không thuộc BSC trên đường dẫn.' });
    return item;
  }

  private reviewPlan(actor: AuthUser, id: string, action: 'APPROVE_PLAN' | 'RETURN_PLAN', reason: string | undefined, metadata: AuditRequestMetadata) {
    return this.repository.reviewPlanWorkflow(actor, id, action, metadata, (snapshot) => {
      const normalizedReason = this.workflow.assertCanReviewPlan(actor, this.workflowContext(snapshot), action, reason);
      if (action === 'APPROVE_PLAN') this.workflow.assertPlanDefinitionComplete(this.planDefinition(snapshot));
      return normalizedReason;
    });
  }

  private reviewEvaluation(actor: AuthUser, id: string, action: 'APPROVE_EVALUATION' | 'RETURN_EVALUATION', reason: string | undefined, metadata: AuditRequestMetadata) {
    return this.repository.reviewEvaluationWorkflow(actor, id, action, metadata, (snapshot) => {
      const result = this.scoreSnapshot(snapshot);
      const normalizedReason = this.workflow.assertCanReviewEvaluation(actor, this.workflowContext(snapshot), action, reason);
      this.workflow.assertEvaluationScoringComplete(result);
      return { scoring: result, reason: normalizedReason };
    });
  }

  private scoreSnapshot(snapshot: { items: Array<{ id: string; calculation_method: string; target_value: Prisma.Decimal | null; actual_value: Prisma.Decimal | null; weight: Prisma.Decimal }> }) {
    return this.scoring.scoreBsc(snapshot.items.map((item) => ({ itemId: item.id, calculationMethod: item.calculation_method,
      targetValue: item.target_value, actualValue: item.actual_value, weight: item.weight })));
  }

  private planDefinition(snapshot: { items: Array<{ kpi_name: string; target_value: Prisma.Decimal | null; target_text: string | null; weight: Prisma.Decimal; calculation_method: string }> }) {
    return { items: snapshot.items.map((item) => ({ kpiName: item.kpi_name, targetValue: item.target_value,
      targetText: item.target_text, weight: Number(item.weight), calculationMethod: item.calculation_method })) };
  }

  private workflowContext(snapshot: any) {
    return {
      employeeId: snapshot.employee_id, directManagerId: snapshot.direct_manager_id, departmentId: snapshot.department_id,
      planStatus: snapshot.plan_status, evaluationStatus: snapshot.evaluation_status, cycleStatus: snapshot.cycle_status,
      submissionDeadline: snapshot.submission_deadline,
      ownerActive: snapshot.owner_status === 'ACTIVE' && snapshot.owner_deleted_at === null,
      ownerOrganizationActive: snapshot.department_status === 'ACTIVE' && snapshot.position_status === 'ACTIVE',
      reviewerActive: snapshot.reviewer_status === 'ACTIVE' && snapshot.reviewer_deleted_at === null
        && snapshot.reviewer_matches_owner && snapshot.reviewer_organization_active,
    };
  }

  private listAccessWhere(actor: AuthUser): Prisma.employee_bscWhereInput {
    const clauses: Prisma.employee_bscWhereInput[] = [];
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_OWN)) clauses.push({ employee_id: actor.id });
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_SUBORDINATE)) {
      const departments = actor.roles.filter((role) => role.scopeType === 'DEPARTMENT' && role.scopeId).map((role) => role.scopeId!);
      if (actor.roles.some((role) => role.scopeType === 'GLOBAL')) clauses.push({ direct_manager_id: actor.id });
      else if (departments.length) clauses.push({ direct_manager_id: actor.id, department_id: { in: departments } });
    }
    if (actor.permissions.includes(BSC_PERMISSIONS.VIEW_UNIT)) {
      if (actor.roles.some((role) => role.scopeType === 'GLOBAL')) return {};
      const departments = actor.roles.filter((role) => role.scopeType === 'DEPARTMENT' && role.scopeId).map((role) => role.scopeId!);
      if (departments.length) clauses.push({ department_id: { in: departments } });
    }
    if (!clauses.length) throw new BadRequestException({ code: 'BSC_ACCESS_DENIED', message: 'Không có phạm vi xem BSC phù hợp.' });
    return { OR: clauses };
  }

  private canUseDepartmentFilter(actor: AuthUser, departmentId: string): boolean {
    return actor.roles.some((role) => role.scopeType === 'GLOBAL')
      || actor.roles.some((role) => role.scopeType === 'DEPARTMENT' && role.scopeId === departmentId)
      || (actor.permissions.includes(BSC_PERMISSIONS.VIEW_OWN) && actor.departmentId === departmentId);
  }

  private mapItemMutationError(error: unknown): never {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') throw new ConflictException({ code: 'BSC_ITEM_CODE_EXISTS', message: 'Mã KPI đã tồn tại trong BSC.' });
    if (code === 'P2034') throw new ConflictException({ code: 'BSC_CONCURRENT_UPDATE', message: 'BSC vừa được cập nhật đồng thời, vui lòng thử lại.' });
    throw error;
  }

  private noEditableFields(): never {
    throw new BadRequestException({ code: 'BSC_FIELD_NOT_EDITABLE', message: 'Không có trường hợp lệ để cập nhật.' });
  }
}
