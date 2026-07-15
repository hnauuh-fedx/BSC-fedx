import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequireAnyPermission } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { BSC_PERMISSIONS } from '../employee-bsc/policies/bsc-access.policy';
import { BscCyclesService } from './bsc-cycles.service';

const CYCLE_READ_PERMISSIONS = [
  BSC_PERMISSIONS.CREATE_OWN,
  BSC_PERMISSIONS.VIEW_OWN,
  BSC_PERMISSIONS.VIEW_SUBORDINATE,
  BSC_PERMISSIONS.VIEW_UNIT,
] as const;

@Controller('bsc-cycles')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class BscCyclesController {
  constructor(private readonly service: BscCyclesService) {}

  @Get('open')
  @RequireAnyPermission(...CYCLE_READ_PERMISSIONS)
  findOpen(@CurrentUser() actor: AuthUser) {
    return this.service.findOpen(actor);
  }

  @Get(':id')
  @RequireAnyPermission(...CYCLE_READ_PERMISSIONS)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
