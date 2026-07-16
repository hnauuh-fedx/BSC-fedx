import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AuthUser } from '../../../common/types/auth-user.type';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { AuditLogsService, AuditLogQueryDto } from '../services/audit-logs.service';

@Controller('audit-logs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@RequirePermissions('audit.view')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  findAll(@CurrentUser() actor: AuthUser, @Query() query: AuditLogQueryDto) {
    return this.service.findAll(actor, query);
  }

  @Get('modules')
  findModules(@CurrentUser() actor: AuthUser) {
    return this.service.findModules(actor);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.findOne(actor, id);
  }
}
