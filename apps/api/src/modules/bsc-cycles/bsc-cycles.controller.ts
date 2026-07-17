import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { BSC_PERMISSIONS } from '../employee-bsc/policies/bsc-access.policy';
import { BSC_CYCLE_PERMISSIONS } from './bsc-cycle.policy';
import { BscCyclesService } from './bsc-cycles.service';
import { CreateBscCycleDto, QueryBscCycleDto, TransitionBscCycleDto, UpdateBscCycleDto } from './dto/bsc-cycle.dto';

const CYCLE_BUSINESS_READ_PERMISSIONS = [
  BSC_PERMISSIONS.CREATE_OWN,
  BSC_PERMISSIONS.VIEW_OWN,
  BSC_PERMISSIONS.VIEW_SUBORDINATE,
  BSC_PERMISSIONS.VIEW_UNIT,
] as const;

@Controller('bsc-cycles')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class BscCyclesController {
  constructor(private readonly service: BscCyclesService) {}

  @Get()
  @RequireAnyPermission(BSC_CYCLE_PERMISSIONS.VIEW, BSC_CYCLE_PERMISSIONS.MANAGE)
  findAll(@CurrentUser() actor: AuthUser, @Query() query: QueryBscCycleDto) {
    return this.service.findAll(actor, query);
  }

  @Post()
  @RequirePermissions(BSC_CYCLE_PERMISSIONS.MANAGE)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBscCycleDto, @Req() request: Request) {
    return this.service.create(actor, dto, metadata(request));
  }

  @Get('open')
  @RequireAnyPermission(...CYCLE_BUSINESS_READ_PERMISSIONS)
  findOpen(@CurrentUser() actor: AuthUser) {
    return this.service.findOpen(actor);
  }

  @Get(':id')
  @RequireAnyPermission(BSC_CYCLE_PERMISSIONS.VIEW, BSC_CYCLE_PERMISSIONS.MANAGE, ...CYCLE_BUSINESS_READ_PERMISSIONS)
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.findOne(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(BSC_CYCLE_PERMISSIONS.MANAGE)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateBscCycleDto, @Req() request: Request) {
    return this.service.update(actor, id, dto, metadata(request));
  }

  @Post(':id/open')
  @HttpCode(200)
  @RequirePermissions(BSC_CYCLE_PERMISSIONS.MANAGE)
  open(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: TransitionBscCycleDto, @Req() request: Request) {
    return this.service.transition(actor, id, 'OPEN', dto.expectedVersion, metadata(request), dto.reason);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @RequirePermissions(BSC_CYCLE_PERMISSIONS.MANAGE)
  lock(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: TransitionBscCycleDto, @Req() request: Request) {
    return this.service.transition(actor, id, 'LOCKED', dto.expectedVersion, metadata(request), dto.reason);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(BSC_CYCLE_PERMISSIONS.MANAGE)
  close(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: TransitionBscCycleDto, @Req() request: Request) {
    return this.service.transition(actor, id, 'CLOSED', dto.expectedVersion, metadata(request), dto.reason);
  }

}

function metadata(request: Request): AuditRequestMetadata {
  const userAgent = request.headers['user-agent'];
  return { ipAddress: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
