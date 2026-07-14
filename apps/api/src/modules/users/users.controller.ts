import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserQueryDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Get() @RequirePermissions('user.view') findAll(@CurrentUser() u: AuthUser, @Query() q: UserQueryDto) { return this.service.findAll(u, q); }
  @Get(':id') @RequirePermissions('user.view') one(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.findOne(u, id); }
  @Post() @RequirePermissions('user.create') create(@CurrentUser() u: AuthUser, @Body() d: CreateUserDto) { return this.service.create(u, d); }
  @Patch(':id') @RequirePermissions('user.update') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateUserDto) { return this.service.update(u, id, d); }
  @Post(':id/activate') @RequirePermissions('user.update') activate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'ACTIVE'); }
  @Post(':id/deactivate') @RequirePermissions('user.lock') deactivate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'INACTIVE'); }
  @Post(':id/lock') @RequirePermissions('user.lock') lock(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'LOCKED'); }
  @Post(':id/unlock') @RequirePermissions('user.lock') unlock(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'ACTIVE'); }
  @Post(':id/reset-password') @RequirePermissions('user.password.reset') resetPassword(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ResetPasswordDto) { return this.service.resetPassword(u, id, d); }
}
