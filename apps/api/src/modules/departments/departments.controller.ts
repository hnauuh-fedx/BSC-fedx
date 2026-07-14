import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { DepartmentMutationDto, DepartmentQueryDto, UpdateDepartmentDto } from './departments.dto';
import { DepartmentsService } from './departments.service';
@Controller('departments') @UseGuards(JwtAccessGuard, PermissionsGuard)
export class DepartmentsController { constructor(private readonly service: DepartmentsService) {}
  @Get() @RequirePermissions('department.view') findAll(@CurrentUser() u: AuthUser, @Query() q: DepartmentQueryDto) { return this.service.findAll(u, q); }
  @Get('tree') @RequirePermissions('department.view') tree(@CurrentUser() u: AuthUser) { return this.service.tree(u); }
  @Get(':id') @RequirePermissions('department.view') one(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.findOne(u, id); }
  @Post() @RequirePermissions('department.manage') create(@CurrentUser() u: AuthUser, @Body() d: DepartmentMutationDto) { return this.service.create(u, d); }
  @Patch(':id') @RequirePermissions('department.manage') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateDepartmentDto) { return this.service.update(u, id, d); }
  @Post(':id/activate') @RequirePermissions('department.manage') activate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'ACTIVE'); }
  @Post(':id/deactivate') @RequirePermissions('department.manage') deactivate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'INACTIVE'); }
}
