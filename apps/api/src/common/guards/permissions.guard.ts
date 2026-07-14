import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>('anyPermissions', [context.getHandler(), context.getClass()]);
    if (!requiredPermissions && !anyPermissions) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const permissions = new Set(user?.permissions ?? []);
    const allowed = requiredPermissions
      ? requiredPermissions.every((permission) => permissions.has(permission))
      : anyPermissions!.some((permission) => permissions.has(permission));
    if (!allowed) {
      throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    return true;
  }
}
