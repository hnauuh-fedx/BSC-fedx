import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/types/auth-user.type';
import { CreateBscItemDto, UpdateBscActualDto, UpdateBscItemDto } from '../dto/bsc-item.dto';
import { CreateEmployeeBscDto } from '../dto/create-employee-bsc.dto';
import { QueryEmployeeBscDto } from '../dto/query-employee-bsc.dto';
import { UpdateEmployeeBscDto } from '../dto/update-employee-bsc.dto';
import { QueryReopenRequestDto } from '../dto/reopen-bsc.dto';
import { AuditRequestMetadata } from '../employee-bsc.types';
import { BSC_PERMISSIONS, BscAccessPolicy } from '../policies/bsc-access.policy';
import { EmployeeBscRepository } from '../repositories/employee-bsc.repository';
import { assertBinaryActual, assertTargetCompatible, assertValidWeight } from '../validators/bsc-item.validator';
import { BscScoringService } from './bsc-scoring.service';
import { BscWorkflowService } from './bsc-workflow.service';
import { BSC_GOAL_GROUPS } from '../bsc-goal-groups';
import { BSC_CALCULATION_METHOD } from '../bsc-item-defaults';

type WorkflowSnapshot = Parameters<Parameters<EmployeeBscRepository['submitPlanWorkflow']>[3]>[0];
type ReopenDecisionSnapshot = Parameters<Parameters<EmployeeBscRepository['approveReopenRequest']>[3]>[0];

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
    if (employee.departments.status !== 'ACTIVE' || employee.positions.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'BSC_OWNER_ORGANIZATION_INACTIVE', message: 'Đơn vị và chức danh của người lập phải đang hoạt động.' });
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
    const visible = this.policy.listWhere(actor);
    const access = query.scope === 'OWN' ? { AND: [visible, { employee_id: actor.id }] } : visible;
    if (query.departmentId && !this.policy.canFilterDepartment(actor, query.departmentId)) {
      throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Không thể lọc ngoài phạm vi được cấp.' });
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
    if (!query.stage) throw new BadRequestException({ code: 'BSC_REVIEW_STAGE_REQUIRED', message: 'Phải chọn giai đoạn kế hoạch hoặc đánh giá.' });
    const approvePermission = query.stage === 'PLAN' ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE;
    const returnPermission = query.stage === 'PLAN' ? BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE;
    if (!actor.permissions.includes(approvePermission) && !actor.permissions.includes(returnPermission)) {
      throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Không có quyền xử lý BSC chờ duyệt.' });
    }
    if (query.departmentId && !this.policy.canFilterDepartment(actor, query.departmentId)) {
      throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Không thể lọc ngoài phạm vi được cấp.' });
    }
    const access = this.policy.pendingReviewWhere(actor, query.stage);
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
    await this.policy.assertCanView(actor, bsc);
    const visibleStages = new Set<string>();
    if (this.policy.canViewStageHistory(actor, bsc, BSC_PERMISSIONS.VIEW_PLAN_HISTORY)) visibleStages.add('PLAN');
    if (this.policy.canViewStageHistory(actor, bsc, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY)) visibleStages.add('EVALUATION');
    return {
      ...bsc,
      goal_groups: BSC_GOAL_GROUPS,
      bsc_status_histories: bsc.bsc_status_histories.filter((history) => visibleStages.has(history.stage)),
    };
  }

  async scoringPreview(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanView(actor, bsc);
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

  async versions(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanViewVersion(actor, bsc);
    return this.repository.findVersions(id);
  }

  async versionDetail(actor: AuthUser, id: string, versionId: string) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanViewVersion(actor, bsc);
    const version = await this.repository.findVersion(id, versionId);
    if (!version) throw new NotFoundException({ code: 'BSC_VERSION_NOT_FOUND', message: 'Không tìm thấy phiên bản BSC.' });
    return {
      id: version.id,
      versionNumber: version.version_number,
      stage: version.stage,
      versionType: version.version_type,
      snapshot: version.snapshot,
      createdAt: version.created_at,
      createdBy: version.users,
      sourceReviewId: version.source_review_id,
      sourceReopenRequestId: version.source_reopen_request_id,
    };
  }

  async createReopenRequest(actor: AuthUser, id: string, stage: 'PLAN' | 'EVALUATION', rawReason: string, metadata: AuditRequestMetadata) {
    const reason = this.normalizeReason(rawReason, 'BSC_REOPEN_REASON_REQUIRED');
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanRequestReopen(actor, bsc);
    try {
      return await this.repository.createReopenRequest(actor, id, stage, reason, metadata, (snapshot) => {
        if (snapshot.employee_id !== actor.id) throw new BadRequestException({ code: 'BSC_REOPEN_NOT_ALLOWED', message: 'Chỉ chủ sở hữu được yêu cầu mở lại BSC.' });
        const status = stage === 'PLAN' ? snapshot.plan_status : snapshot.evaluation_status;
        if (status !== 'APPROVED') throw new ConflictException({
          code: stage === 'PLAN' ? 'BSC_PLAN_NOT_APPROVED_FOR_REOPEN' : 'BSC_EVALUATION_NOT_APPROVED_FOR_REOPEN',
          message: 'Chỉ stage đã duyệt mới được yêu cầu mở lại.',
        });
        if (snapshot.owner_status !== 'ACTIVE' || snapshot.owner_deleted_at || snapshot.department_status !== 'ACTIVE'
          || snapshot.position_status !== 'ACTIVE') {
          throw new BadRequestException({ code: 'BSC_REOPEN_NOT_ALLOWED', message: 'Chủ sở hữu hoặc tổ chức không hoạt động.' });
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'BSC_REOPEN_REQUEST_ALREADY_PENDING', message: 'Đã có yêu cầu mở lại đang chờ xử lý cho stage này.' });
      }
      throw error;
    }
  }

  async reopenRequests(actor: AuthUser, bscId: string) {
    const bsc = await this.requireBsc(bscId);
    await this.policy.assertActiveResource(bsc);
    if (actor.id === bsc.employee_id) this.policy.assertCanRequestReopen(actor, bsc);
    else this.policy.assertCanViewReopenHistory(actor, bsc);
    return this.repository.findReopenRequestsForBsc(bscId);
  }

  pendingReopenRequests(actor: AuthUser, query: QueryReopenRequestDto) {
    if (!actor.permissions.includes(BSC_PERMISSIONS.REVIEW_REOPEN)) {
      throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Không có quyền xử lý yêu cầu mở lại.' });
    }
    return this.repository.findPendingReopenRequests(this.policy.pendingReopenWhere(actor), query);
  }

  async reopenRequestDetail(actor: AuthUser, requestId: string) {
    const request = await this.repository.findReopenRequest(requestId);
    if (!request) throw new NotFoundException({ code: 'BSC_REOPEN_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu mở lại.' });
    await this.policy.assertActiveResource(request.employee_bsc);
    if (actor.id === request.employee_bsc.employee_id) this.policy.assertCanRequestReopen(actor, request.employee_bsc);
    else this.policy.assertCanViewReopenHistory(actor, request.employee_bsc);
    return request;
  }

  async approveReopenRequest(actor: AuthUser, requestId: string, metadata: AuditRequestMetadata) {
    const request = await this.repository.findReopenRequest(requestId);
    if (!request) throw new NotFoundException({ code: 'BSC_REOPEN_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu mở lại.' });
    await this.policy.assertCanReviewReopen(actor, request.employee_bsc);
    return this.repository.approveReopenRequest(actor, requestId, metadata, (snapshot) => this.assertReopenDecision(actor, snapshot));
  }

  async rejectReopenRequest(actor: AuthUser, requestId: string, rawReason: string, metadata: AuditRequestMetadata) {
    const reason = this.normalizeReason(rawReason, 'BSC_REOPEN_REJECT_REASON_REQUIRED');
    const request = await this.repository.findReopenRequest(requestId);
    if (!request) throw new NotFoundException({ code: 'BSC_REOPEN_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu mở lại.' });
    await this.policy.assertCanReviewReopen(actor, request.employee_bsc);
    return this.repository.rejectReopenRequest(actor, requestId, reason, metadata, (snapshot) => this.assertReopenDecision(actor, snapshot));
  }

  async duplicateOptions(actor: AuthUser, id: string) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanDuplicateOwn(actor, bsc);
    const versions = await this.repository.findVersions(id);
    const firstVersion = versions.find((version) => version.versionNumber === 1) ?? null;
    const cycles = await this.repository.findDuplicateOptions(id, actor.id);
    return { sourceBscId: id, sourceVersion: firstVersion, cycles, suggestedCycleId: cycles[0]?.id ?? null };
  }

  async duplicate(actor: AuthUser, id: string, targetCycleId: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanDuplicateOwn(actor, bsc);
    try {
      return await this.repository.duplicateFromFirstVersion(actor, id, targetCycleId, metadata);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') {
        throw new ConflictException({ code: 'BSC_DUPLICATE_CONFLICT', message: 'BSC vừa được sao chép đồng thời, vui lòng thử lại.' });
      }
      throw error;
    }
  }

  async submitPlan(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanSubmitOwn(actor, bsc, BSC_PERMISSIONS.SUBMIT_PLAN_OWN);
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

  async resetApprovedPlan(actor: AuthUser, id: string, rawReason: string, metadata: AuditRequestMetadata) {
    const reason = this.normalizeReason(rawReason, 'BSC_RESET_REASON_REQUIRED');
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanResetApproved(actor, bsc);
    return this.repository.resetApprovedStage(actor, id, 'PLAN', reason, metadata, (snapshot) => {
      this.assertDirectResetAllowed(snapshot, 'PLAN');
    });
  }

  async submitEvaluation(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanSubmitOwn(actor, bsc, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN);
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

  async resetApprovedEvaluation(actor: AuthUser, id: string, rawReason: string, metadata: AuditRequestMetadata) {
    const reason = this.normalizeReason(rawReason, 'BSC_RESET_REASON_REQUIRED');
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanResetApproved(actor, bsc);
    return this.repository.resetApprovedStage(actor, id, 'EVALUATION', reason, metadata, (snapshot) => {
      this.assertDirectResetAllowed(snapshot, 'EVALUATION');
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateEmployeeBscDto, metadata: AuditRequestMetadata) {
    if (dto.employeeComment === undefined) this.noEditableFields();
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanUpdateOwn(actor, bsc);
    return this.repository.updateDraftComment(actor, id, dto.employeeComment, metadata);
  }

  async delete(actor: AuthUser, id: string, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanDeleteOwn(actor, bsc);
    await this.repository.deleteDraft(actor, bsc, metadata);
    return { success: true };
  }

  async createItem(actor: AuthUser, bscId: string, dto: CreateBscItemDto, metadata: AuditRequestMetadata) {
    assertValidWeight(dto.weight);
    assertTargetCompatible(BSC_CALCULATION_METHOD, dto.targetValue);
    const bsc = await this.requireBsc(bscId);
    await this.policy.assertActiveResource(bsc);
    await this.policy.assertCanManageKpi(actor, bsc);
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
    await this.policy.assertActiveResource(bsc);
    await this.policy.assertCanManageKpi(actor, bsc);
    const calculationMethod = BSC_CALCULATION_METHOD;
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
    await this.policy.assertActiveResource(bsc);
    this.policy.assertCanUpdateActual(actor, bsc);
    assertBinaryActual(item.calculation_method, dto.actualValue);
    return this.repository.updateActual(actor, bscId, itemId, dto, metadata);
  }

  async deleteItem(actor: AuthUser, bscId: string, itemId: string, metadata: AuditRequestMetadata) {
    const [bsc] = await Promise.all([this.requireBsc(bscId), this.requireItemInBsc(bscId, itemId)]);
    await this.policy.assertActiveResource(bsc);
    await this.policy.assertCanManageKpi(actor, bsc);
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

  private async reviewPlan(actor: AuthUser, id: string, action: 'APPROVE_PLAN' | 'RETURN_PLAN', reason: string | undefined, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanReview(actor, bsc, action === 'APPROVE_PLAN'
      ? BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE : BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE);
    return this.repository.reviewPlanWorkflow(actor, id, action, metadata, (snapshot) => {
      const normalizedReason = this.workflow.assertCanReviewPlan(actor, this.workflowContext(snapshot), action, reason);
      if (action === 'APPROVE_PLAN') this.workflow.assertPlanDefinitionComplete(this.planDefinition(snapshot));
      return normalizedReason;
    });
  }

  private async reviewEvaluation(actor: AuthUser, id: string, action: 'APPROVE_EVALUATION' | 'RETURN_EVALUATION', reason: string | undefined, metadata: AuditRequestMetadata) {
    const bsc = await this.requireBsc(id);
    await this.policy.assertCanReview(actor, bsc, action === 'APPROVE_EVALUATION'
      ? BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE : BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE);
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

  private workflowContext(snapshot: WorkflowSnapshot) {
    return {
      employeeId: snapshot.employee_id, departmentId: snapshot.department_id,
      planStatus: snapshot.plan_status, evaluationStatus: snapshot.evaluation_status, cycleStatus: snapshot.cycle_status,
      ownerActive: snapshot.owner_status === 'ACTIVE' && snapshot.owner_deleted_at === null,
      ownerOrganizationActive: snapshot.department_status === 'ACTIVE' && snapshot.position_status === 'ACTIVE',
    };
  }

  private assertReopenDecision(actor: AuthUser, request: ReopenDecisionSnapshot): void {
    if (request.status !== 'PENDING') throw new ConflictException({ code: 'BSC_REOPEN_REQUEST_NOT_PENDING', message: 'Yêu cầu không còn ở trạng thái chờ xử lý.' });
    if (request.cycle_status === 'CLOSED') {
      throw new ConflictException({ code: 'BSC_CYCLE_CLOSED', message: 'Kỳ BSC đã kết thúc nên không thể phê duyệt yêu cầu mở lại.' });
    }
    if (!this.policy.canReviewAsDirector(actor, BSC_PERMISSIONS.REVIEW_REOPEN, request.department_id)) {
      throw new ForbiddenException({ code: 'BSC_ACCESS_DENIED', message: 'Chỉ Giám đốc được xử lý yêu cầu mở lại BSC.' });
    }
    if (!request.owner_active || !request.organization_active) {
      throw new BadRequestException({ code: 'BSC_REOPEN_NOT_ALLOWED', message: 'BSC, người dùng hoặc tổ chức không còn đủ điều kiện mở lại.' });
    }
    const stageStatus = request.stage === 'PLAN' ? request.plan_status : request.evaluation_status;
    if (stageStatus !== 'APPROVED') throw new ConflictException({ code: 'BSC_REOPEN_WORKFLOW_CONFLICT', message: 'Stage không còn ở trạng thái đã duyệt.' });
  }

  private assertDirectResetAllowed(snapshot: WorkflowSnapshot, stage: 'PLAN' | 'EVALUATION'): void {
    if (snapshot.cycle_status !== 'OPEN') {
      const code = snapshot.cycle_status === 'LOCKED' ? 'BSC_CYCLE_LOCKED'
        : snapshot.cycle_status === 'CLOSED' ? 'BSC_CYCLE_CLOSED' : 'BSC_CYCLE_NOT_OPEN';
      throw new ConflictException({ code, message: 'Kỳ BSC không cho phép mở lại trực tiếp dữ liệu đã duyệt.' });
    }
    if (snapshot.owner_status !== 'ACTIVE' || snapshot.owner_deleted_at
      || snapshot.department_status !== 'ACTIVE' || snapshot.position_status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'BSC_RESET_NOT_ALLOWED', message: 'BSC, người dùng hoặc tổ chức không còn đủ điều kiện mở lại.' });
    }
    const approved = stage === 'PLAN'
      ? snapshot.plan_status === 'APPROVED'
      : snapshot.plan_status === 'APPROVED' && snapshot.evaluation_status === 'APPROVED';
    if (!approved) throw new ConflictException({
      code: stage === 'PLAN' ? 'BSC_PLAN_NOT_APPROVED_FOR_RESET' : 'BSC_EVALUATION_NOT_APPROVED_FOR_RESET',
      message: 'Chỉ giai đoạn đã duyệt mới được mở lại trực tiếp.',
    });
  }

  private normalizeReason(reason: string | undefined, code: string): string {
    const normalized = (reason ?? '').trim().replace(/<[^>]*>/g, '').trim();
    if (!normalized) throw new BadRequestException({ code, message: 'Lý do là bắt buộc.' });
    return normalized;
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
