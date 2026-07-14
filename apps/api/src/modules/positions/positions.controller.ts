import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { PositionMutationDto, PositionQueryDto, UpdatePositionDto } from './positions.dto';
import { PositionsService } from './positions.service';
@Controller('positions') @UseGuards(JwtAccessGuard, PermissionsGuard)
export class PositionsController { constructor(private readonly service: PositionsService) {}
  @Get() @RequirePermissions('position.view') findAll(@CurrentUser() u: AuthUser, @Query() q: PositionQueryDto) { return this.service.findAll(u, q); }
  @Get(':id') @RequirePermissions('position.view') one(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.findOne(u, id); }
  @Post() @RequirePermissions('position.manage') create(@CurrentUser() u: AuthUser, @Body() d: PositionMutationDto) { return this.service.create(u, d); }
  @Patch(':id') @RequirePermissions('position.manage') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdatePositionDto) { return this.service.update(u, id, d); }
  @Post(':id/activate') @RequirePermissions('position.manage') activate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'ACTIVE'); }
  @Post(':id/deactivate') @RequirePermissions('position.manage') deactivate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.setStatus(u, id, 'INACTIVE'); }
}
