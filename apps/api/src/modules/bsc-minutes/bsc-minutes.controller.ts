import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AuditRequestMetadata } from '../employee-bsc/employee-bsc.types';
import { QueryBscMinutesDto, RecordBscMinutesOutputDto, SaveBscMinutesDto } from './bsc-minutes.dto';
import { BSC_MINUTES_PERMISSIONS as P } from './bsc-minutes.permissions';
import { BscMinutesService } from './bsc-minutes.service';

@Controller('bsc-minutes')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class BscMinutesController {
  constructor(private readonly service: BscMinutesService) {}

  @Get() @RequirePermissions(P.VIEW)
  list(@CurrentUser() actor: AuthUser, @Query() query: QueryBscMinutesDto) { return this.service.list(actor, query); }

  @Get(':id') @RequirePermissions(P.VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.service.detail(actor, id); }

  @Post() @RequirePermissions(P.CREATE)
  create(@CurrentUser() actor: AuthUser, @Body() dto: SaveBscMinutesDto, @Req() req: Request) { return this.service.create(actor, dto, metadata(req)); }

  @Patch(':id') @RequirePermissions(P.CREATE)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: SaveBscMinutesDto, @Req() req: Request) { return this.service.update(actor, id, dto, metadata(req)); }

  @Post(':id/output') @HttpCode(200) @RequirePermissions(P.CREATE)
  output(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: RecordBscMinutesOutputDto, @Req() req: Request) {
    return this.service.recordOutput(actor, id, dto.type, metadata(req));
  }
}

function metadata(req: Request): AuditRequestMetadata {
  const userAgent = req.headers['user-agent'];
  return { ipAddress: req.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
