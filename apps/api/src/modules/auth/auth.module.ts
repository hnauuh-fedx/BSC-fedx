import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ResourceScopePolicy } from '../../common/policies/resource-scope.policy';
import { RbacTestController } from './controllers/rbac-test.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    // JwtModule không register secret ở đây vì mỗi sign/verify gọi riêng với secret cụ thể.
    // Register mặc định để JwtService có thể inject.
    JwtModule.register({}),
  ],
  controllers: process.env.NODE_ENV === 'production' ? [AuthController] : [AuthController, RbacTestController],
  providers: [
    AuthService,
    AuthRepository,
    JwtAccessStrategy,
    JwtAccessGuard,
    PermissionsGuard,
    ResourceScopePolicy,
  ],
  exports: [
    AuthService,
    JwtAccessGuard,
    PermissionsGuard,
    ResourceScopePolicy,
    JwtModule,
  ],
})
export class AuthModule {}
