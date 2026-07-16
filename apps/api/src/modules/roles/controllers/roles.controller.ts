import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AuthUser } from '../../../common/types/auth-user.type';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesService } from '../services/roles.service';
import { IsArray, IsUUID } from 'class-validator';

class UpdateRolePermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

@Controller()
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('roles')
  @RequirePermissions('role.view')
  findAll() {
    return this.service.findAll();
  }

  @Get('roles/:id')
  @RequirePermissions('role.view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get('permissions')
  @RequirePermissions('permission.view')
  findAllPermissions() {
    return this.service.findAllPermissions();
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('role.manage')
  updatePermissions(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.service.updatePermissions(actor, id, dto.permissionIds);
  }
}
