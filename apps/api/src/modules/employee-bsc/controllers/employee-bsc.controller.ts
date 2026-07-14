import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { EmployeeBscService } from '../services/employee-bsc.service';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@Controller('employee-bsc')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class EmployeeBscController {
  constructor(private readonly bscService: EmployeeBscService) {}

  @Get()
  @RequirePermissions('bsc.view.all')
  findAll() {
    return this.bscService.findAll();
  }
}
