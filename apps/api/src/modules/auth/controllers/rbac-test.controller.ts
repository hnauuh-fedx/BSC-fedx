import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { ResourceScopePolicy } from '../../../common/policies/resource-scope.policy';
import { AuthUser } from '../../../common/types/auth-user.type';
import { JwtAccessGuard } from '../guards/jwt-access.guard';

/** Development/test-only endpoints for verifying RBAC wiring; excluded from production module. */
@Controller('auth')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class RbacTestController {
  constructor(private readonly scopePolicy: ResourceScopePolicy) {}

  @Get('permissions-test')
  @RequirePermissions('rbac.test')
  permissionsTest() { return { allowed: true }; }

  @Get('scope-test/self/:userId')
  scopeSelf(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    this.scopePolicy.assertResourceScope(user, { ownerId: userId });
    return { allowed: true };
  }

  @Get('scope-test/department/:departmentId')
  scopeDepartment(@CurrentUser() user: AuthUser, @Param('departmentId') departmentId: string) {
    this.scopePolicy.assertResourceScope(user, { departmentId });
    return { allowed: true };
  }
}
