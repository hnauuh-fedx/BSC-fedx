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
  @RequireAnyPermission(BSC_PERMISSIONS.APPROVE_SUBORDINATE, BSC_PERMISSIONS.RETURN_SUBORDINATE)
  pendingReview(@CurrentUser() actor: AuthUser, @Query() query: QueryEmployeeBscDto) {
    return this.service.pendingReview(actor, query);
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

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.SUBMIT_OWN)
  submit(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.submit(actor, id, metadata(request));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.APPROVE_SUBORDINATE)
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() _dto: SubmitBscDto, @Req() request: Request) {
    return this.service.approve(actor, id, metadata(request));
  }

  @Post(':id/return')
  @HttpCode(200)
  @RequirePermissions(BSC_PERMISSIONS.RETURN_SUBORDINATE)
  returnBsc(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReturnBscDto, @Req() request: Request) {
    return this.service.returnBsc(actor, id, dto.reason, metadata(request));
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
  @RequirePermissions(BSC_PERMISSIONS.MANAGE_KPI)
  createItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Body() dto: CreateBscItemDto, @Req() request: Request) {
    return this.service.createItem(actor, bscId, dto, metadata(request));
  }

  @Patch(':bscId/items/:itemId')
  @RequirePermissions(BSC_PERMISSIONS.MANAGE_KPI)
  updateItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Body() dto: UpdateBscItemDto, @Req() request: Request) {
    return this.service.updateItem(actor, bscId, itemId, dto, metadata(request));
  }

  @Patch(':bscId/items/:itemId/actual')
  @RequireAnyPermission(BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL)
  updateActual(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Body() dto: UpdateBscActualDto, @Req() request: Request) {
    return this.service.updateActual(actor, bscId, itemId, dto, metadata(request));
  }

  @Delete(':bscId/items/:itemId')
  @RequirePermissions(BSC_PERMISSIONS.MANAGE_KPI)
  deleteItem(@CurrentUser() actor: AuthUser, @Param('bscId') bscId: string, @Param('itemId') itemId: string, @Req() request: Request) {
    return this.service.deleteItem(actor, bscId, itemId, metadata(request));
  }
}

function metadata(request: Request): AuditRequestMetadata {
  const userAgent = request.headers['user-agent'];
  return { ipAddress: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
