import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { validateEnvironment } from '../../../config/env.validation';
import { AccessTokenPayload } from '../types/auth-token-payload.type';
import { AuthUser } from '../../../common/types/auth-user.type';
import { AuthRepository } from '../repositories/auth.repository';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(private readonly authRepository: AuthRepository) {
    const env = validateEnvironment();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token type không hợp lệ.');
    }
    const user = await this.authRepository.findAuthUserById(payload.sub);
    if (!user || user.deleted_at !== null || user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không khả dụng.');
    const roles = user.user_roles_user_roles_user_idTousers.map((assignment) => ({
      code: assignment.roles.code,
      scopeType: assignment.scope_type as AuthUser['roles'][number]['scopeType'],
      scopeId: assignment.scope_id,
      permissions: assignment.roles.role_permissions.map((rolePermission) => rolePermission.permissions.code),
    }));
    const permissions = [...new Set(user.user_roles_user_roles_user_idTousers.flatMap((assignment) => assignment.roles.role_permissions.map((rolePermission) => rolePermission.permissions.code)))];
    return { id: user.id, employeeCode: user.employee_code, fullName: user.full_name, email: user.email, departmentId: user.department_id, status: user.status, roles, permissions };
  }
}
