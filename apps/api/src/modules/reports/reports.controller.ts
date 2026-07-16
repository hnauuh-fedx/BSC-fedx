import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { BSC_REPORT_EXPORT_LIMIT, BSC_REPORT_PERMISSIONS, BSC_REPORT_VIEW_PERMISSIONS } from './reports.constants';
import { BscDashboardQueryDto, BscReportFilterDto, BscReportQueryDto } from './reports.dto';
import { BscReportsService } from './reports.service';

@Controller('bsc-reports')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class BscReportsController {
  constructor(private readonly service: BscReportsService) {}

  @Get('dashboard') @RequireAnyPermission(...BSC_REPORT_VIEW_PERMISSIONS)
  dashboard(@CurrentUser() actor: AuthUser, @Query() query: BscDashboardQueryDto) { return this.service.dashboard(actor, query); }

  @Get('summary') @RequireAnyPermission(...BSC_REPORT_VIEW_PERMISSIONS)
  summary(@CurrentUser() actor: AuthUser, @Query() query: BscReportFilterDto) { return this.service.summary(actor, query); }

  @Get('options') @RequireAnyPermission(...BSC_REPORT_VIEW_PERMISSIONS)
  options(@CurrentUser() actor: AuthUser) { return this.service.options(actor); }

  @Get('export') @RequireAnyPermission(BSC_REPORT_PERMISSIONS.EXPORT)
  async export(@CurrentUser() actor: AuthUser, @Query() query: BscReportQueryDto, @Res() response: Response) {
    const result = await this.service.export(actor, query);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.setHeader('X-Export-Row-Limit', String(BSC_REPORT_EXPORT_LIMIT));
    response.send(result.buffer);
  }

  @Get() @RequireAnyPermission(...BSC_REPORT_VIEW_PERMISSIONS)
  findAll(@CurrentUser() actor: AuthUser, @Query() query: BscReportQueryDto) { return this.service.findAll(actor, query); }
}
