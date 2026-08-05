import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AuthUser } from '../../../common/types/auth-user.type';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { CreateBscItemDto, UpdateBscActualDto, UpdateBscItemDto } from '../dto/bsc-item.dto';
import { CreateEmployeeBscDto } from '../dto/create-employee-bsc.dto';
import { QueryEmployeeBscDto } from '../dto/query-employee-bsc.dto';
import { UpdateEmployeeBscDto } from '../dto/update-employee-bsc.dto';
import { SubmitBscDto } from '../dto/submit-bsc.dto';
import { ReturnBscDto } from '../dto/return-bsc.dto';
import { CreateReopenRequestDto, DuplicateBscDto, QueryReopenRequestDto, RejectReopenRequestDto, ResetApprovedBscDto } from '../dto/reopen-bsc.dto';
import { AuditRequestMetadata } from '../employee-bsc.types';
import { BSC_PERMISSIONS } from '../policies/bsc-access.policy';
import { EmployeeBscService } from '../services/employee-bsc.service';

@Controller('employee-bsc')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class EmployeeBscController {
  constructor(private readonly service: EmployeeBscService) {}

  @Post()
  @RequirePermissions(BSC_PERMISSIONS.CREATE_OWN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateEmployeeBscDto, @Req() request: Request) {
    return this.service.create(actor, dto, metadata(request));
  }

  @Get()
  @RequireAnyPermission(BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT)
  findAll(@CurrentUser() actor: AuthUser, @Query() query: QueryEmployeeBscDto) {
    return this.service.findAll(actor, query);
  }

  @Get('pending-review')
  @RequireAnyPermission(BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
    BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE)
  pendingReview(@CurrentUser() actor: AuthUser, @Query() query: QueryEmployeeBscDto) {
    return this.service.pendingReview(actor, query);
  }

  @Get('reopen-requests/pending')
  @RequirePermissions(BSC_PERMISSIONS.REVIEW_REOPEN)
  pendingReopenRequests(@CurrentUser() actor: AuthUser, @Query() query: QueryReopenRequestDto) {
    return this.service.pendingReopenRequests(actor, query);
  }

  @Get('reopen-requests/:requestId')
  @RequireAnyPermission(BSC_PERMISSIONS.REQUEST_REOPEN, BSC_PERMISSIONS.REVIEW_REOPEN, BSC_PERMISSIONS.RESET_APPROVED)
  reopenRequestDetail(@CurrentUser() actor: AuthUser, @Param('requestId') requestId: string) {
    return this.service.reopenRequestDetail(actor, requestId);
  }

  @Post('reopen-requests/:requestId/approve')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.REVIEW_REOPEN)
  approveReopenRequest(@CurrentUser() actor: AuthUser, @Param('requestId') requestId: string, @Req() request: Request) {
    return this.service.approveReopenRequest(actor, requestId, metadata(request));
  }

  @Post('reopen-requests/:requestId/reject')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.REVIEW_REOPEN)
  rejectReopenRequest(@CurrentUser() actor: AuthUser, @Param('requestId') requestId: string,
    @Body() dto: RejectReopenRequestDto, @Req() request: Request) {
    return this.service.rejectReopenRequest(actor, requestId, dto.reason, metadata(request));
  }

  @Get(':id/versions')
  @RequirePermissions(BSC_PERMISSIONS.VIEW_VERSION)
  versions(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.versions(actor, id);
  }

  @Get(':id/versions/:versionId')
  @RequirePermissions(BSC_PERMISSIONS.VIEW_VERSION)
  versionDetail(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('versionId') versionId: string) {
    return this.service.versionDetail(actor, id, versionId);
  }

  @Post(':id/reopen-requests')
  @RequirePermissions(BSC_PERMISSIONS.REQUEST_REOPEN)
  createReopenRequest(@CurrentUser() actor: AuthUser, @Param('id') id: string,
    @Body() dto: CreateReopenRequestDto, @Req() request: Request) {
    return this.service.createReopenRequest(actor, id, dto.stage, dto.reason, metadata(request));
  }

  @Get(':id/reopen-requests')
  @RequireAnyPermission(BSC_PERMISSIONS.REQUEST_REOPEN, BSC_PERMISSIONS.REVIEW_REOPEN)
  reopenRequests(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.reopenRequests(actor, id);
  }

  @Get(':id/duplicate-options')
  @RequirePermissions(BSC_PERMISSIONS.DUPLICATE_OWN)
  duplicateOptions(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.duplicateOptions(actor, id);
  }

  @Post(':id/duplicate')
  @RequirePermissions(BSC_PERMISSIONS.DUPLICATE_OWN)
  duplicate(@CurrentUser() actor: AuthUser, @Param('id') id: string,
    @Body() dto: DuplicateBscDto, @Req() request: Request) {
    return this.service.duplicate(actor, id, dto.targetCycleId, metadata(request));
  }

  @Get(':id/scoring-preview')
  @RequireAnyPermission(BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT)
  scoringPreview(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.scoringPreview(actor, id);
  }

  @Get(':id')
  @RequireAnyPermission(BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT)
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.findOne(actor, id);
  }

  @Post(':id/plan/submit')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.SUBMIT_PLAN_OWN)
  submitPlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.submitPlan(actor, id, metadata(request));
  }

  @Post(':id/plan/approve')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE)
  approvePlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.approvePlan(actor, id, metadata(request));
  }

  @Post(':id/plan/return')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE)
  returnPlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReturnBscDto, @Req() request: Request) {
    return this.service.returnPlan(actor, id, dto.reason, metadata(request));
  }

  @Post(':id/plan/reset-approved')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.RESET_APPROVED)
  resetApprovedPlan(@CurrentUser() actor: AuthUser, @Param('id') id: string,
    @Body() dto: ResetApprovedBscDto, @Req() request: Request) {
    return this.service.resetApprovedPlan(actor, id, dto.reason, metadata(request));
  }

  @Post(':id/evaluation/submit')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN)
  submitEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.submitEvaluation(actor, id, metadata(request));
  }

  @Post(':id/evaluation/approve')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE)
  approveEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.approveEvaluation(actor, id, metadata(request));
  }

  @Post(':id/evaluation/return')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE)
  returnEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReturnBscDto, @Req() request: Request) {
    return this.service.returnEvaluation(actor, id, dto.reason, metadata(request));
  }

  @Post(':id/evaluation/reset-approved')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.RESET_APPROVED)
  resetApprovedEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string,
    @Body() dto: ResetApprovedBscDto, @Req() request: Request) {
    return this.service.resetApprovedEvaluation(actor, id, dto.reason, metadata(request));
  }

  @Patch(':id')
  @RequirePermissions(BSC_PERMISSIONS.EDIT_OWN)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeBscDto, @Req() request: Request) {
    return this.service.update(actor, id, dto, metadata(request));
  }

  @Delete(':id')
  @RequirePermissions(BSC_PERMISSIONS.DELETE_OWN)
  delete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() request: Request) {
    return this.service.delete(actor, id, metadata(request));
  }

  @Post(':bscId/items')
  @RequireAnyPermission(BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.EDIT_OWN)
  createItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Body() dto: CreateBscItemDto, @Req() request: Request) {
    return this.service.createItem(actor, bscId, dto, metadata(request));
  }

  @Patch(':bscId/items/:itemId')
  @RequireAnyPermission(BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.EDIT_OWN)
  updateItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Body() dto: UpdateBscItemDto, @Req() request: Request) {
    return this.service.updateItem(actor, bscId, itemId, dto, metadata(request));
  }

  @Patch(':bscId/items/:itemId/actual')
  @RequireAnyPermission(BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL)
  updateActual(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Body() dto: UpdateBscActualDto, @Req() request: Request) {
    return this.service.updateActual(actor, bscId, itemId, dto, metadata(request));
  }

  @Delete(':bscId/items/:itemId')
  @RequireAnyPermission(BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.EDIT_OWN)
  deleteItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Req() request: Request) {
    return this.service.deleteItem(actor, bscId, itemId, metadata(request));
  }
}

function metadata(request: Request): AuditRequestMetadata {
  const userAgent = request.headers['user-agent'];
  return { ipAddress: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
