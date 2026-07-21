import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { CreateDepartmentBscDto, CreateDepartmentBscItemDto, DepartmentBscReopenDto, DuplicateDepartmentBscDto,
  QueryDepartmentBscDto, ReturnDepartmentBscDto, ReviewDepartmentBscReopenDto, UpdateDepartmentBscActualDto,
  UpdateDepartmentBscDto, UpdateDepartmentBscItemDto } from './department-bsc.dto';
import { DEPARTMENT_BSC_PERMISSIONS as P } from './department-bsc.permissions';
import { DepartmentBscService } from './department-bsc.service';

@Controller('department-bsc')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DepartmentBscController {
  constructor(private readonly service: DepartmentBscService) {}
  @Post() @RequirePermissions(P.CREATE) create(@CurrentUser() actor: AuthUser, @Body() dto: CreateDepartmentBscDto, @Req() req: Request) { return this.service.create(actor, dto.cycleId, metadata(req)); }
  @Get() @RequirePermissions(P.VIEW) list(@CurrentUser() actor: AuthUser, @Query() query: QueryDepartmentBscDto) { return this.service.list(actor, query); }
  @Get('pending-review') @RequireAnyPermission(P.APPROVE_PLAN, P.RETURN_PLAN, P.APPROVE_EVALUATION, P.RETURN_EVALUATION) pending(@CurrentUser() actor: AuthUser, @Query() query: QueryDepartmentBscDto) { return this.service.pendingReview(actor, query); }
  @Get('reopen-requests/pending') @RequirePermissions(P.REVIEW_REOPEN) pendingReopen(@CurrentUser() actor: AuthUser) { return this.service.pendingReopen(actor); }
  @Get(':id/scoring-preview') @RequirePermissions(P.VIEW) scoringPreview(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.service.scoringPreview(actor, id); }
  @Get(':id/export') @RequirePermissions(P.EXPORT) async export(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request, @Res() response: Response) {
    const result = await this.service.export(actor, id, metadata(req));
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.send(result.buffer);
  }
  @Get(':id') @RequirePermissions(P.VIEW) detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.service.detail(actor, id); }
  @Patch(':id') @RequirePermissions(P.EDIT) update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentBscDto, @Req() req: Request) { return this.service.update(actor, id, dto, metadata(req)); }
  @Delete(':id') @RequirePermissions(P.DELETE_DRAFT) delete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.service.delete(actor, id, metadata(req)); }
  @Post(':id/items') @RequirePermissions(P.EDIT) createItem(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: CreateDepartmentBscItemDto, @Req() req: Request) { return this.service.createItem(actor, id, dto, metadata(req)); }
  @Patch(':id/items/:itemId') @RequirePermissions(P.EDIT) updateItem(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateDepartmentBscItemDto, @Req() req: Request) { return this.service.updateItem(actor, id, itemId, dto, metadata(req)); }
  @Patch(':id/items/:itemId/actual') @RequirePermissions(P.EDIT) updateActual(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateDepartmentBscActualDto, @Req() req: Request) { return this.service.updateActual(actor, id, itemId, dto, metadata(req)); }
  @Delete(':id/items/:itemId') @RequirePermissions(P.EDIT) deleteItem(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Req() req: Request) { return this.service.deleteItem(actor, id, itemId, metadata(req)); }
  @Post(':id/plan/submit') @HttpCode(200) @RequirePermissions(P.SUBMIT_PLAN) submitPlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.service.submitPlan(actor, id, metadata(req)); }
  @Post(':id/plan/approve') @HttpCode(200) @RequirePermissions(P.APPROVE_PLAN) approvePlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.service.reviewPlan(actor, id, 'APPROVE', undefined, metadata(req)); }
  @Post(':id/plan/return') @HttpCode(200) @RequirePermissions(P.RETURN_PLAN) returnPlan(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReturnDepartmentBscDto, @Req() req: Request) { return this.service.reviewPlan(actor, id, 'RETURN', dto.reason, metadata(req)); }
  @Post(':id/evaluation/submit') @HttpCode(200) @RequirePermissions(P.SUBMIT_EVALUATION) submitEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.service.submitEvaluation(actor, id, metadata(req)); }
  @Post(':id/evaluation/approve') @HttpCode(200) @RequirePermissions(P.APPROVE_EVALUATION) approveEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) { return this.service.reviewEvaluation(actor, id, 'APPROVE', undefined, metadata(req)); }
  @Post(':id/evaluation/return') @HttpCode(200) @RequirePermissions(P.RETURN_EVALUATION) returnEvaluation(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReturnDepartmentBscDto, @Req() req: Request) { return this.service.reviewEvaluation(actor, id, 'RETURN', dto.reason, metadata(req)); }
  @Post(':id/duplicate') @RequirePermissions(P.DUPLICATE) duplicate(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: DuplicateDepartmentBscDto, @Req() req: Request) { return this.service.duplicate(actor, id, dto.targetCycleId, metadata(req)); }
  @Get(':id/versions') @RequirePermissions(P.VIEW_VERSION) versions(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.service.versions(actor, id); }
  @Post(':id/reopen-requests') @RequirePermissions(P.REQUEST_REOPEN) requestReopen(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: DepartmentBscReopenDto, @Req() req: Request) { return this.service.requestReopen(actor, id, dto, metadata(req)); }
  @Post('reopen-requests/:requestId/approve') @HttpCode(200) @RequirePermissions(P.REVIEW_REOPEN) approveReopen(@CurrentUser() actor: AuthUser, @Param('requestId') requestId: string, @Body() dto: ReviewDepartmentBscReopenDto, @Req() req: Request) { return this.service.reviewReopen(actor, requestId, 'APPROVE', dto.reason, metadata(req)); }
  @Post('reopen-requests/:requestId/reject') @HttpCode(200) @RequirePermissions(P.REVIEW_REOPEN) rejectReopen(@CurrentUser() actor: AuthUser, @Param('requestId') requestId: string, @Body() dto: ReviewDepartmentBscReopenDto, @Req() req: Request) { return this.service.reviewReopen(actor, requestId, 'REJECT', dto.reason, metadata(req)); }
}

function metadata(req: Request): AuditRequestMetadata {
  const userAgent = req.headers['user-agent'];
  return { ipAddress: req.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
