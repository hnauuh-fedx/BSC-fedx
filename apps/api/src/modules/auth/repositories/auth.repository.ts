import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface SaveRefreshTokenData {
  userId: string;
  tokenHash: string;
  jti: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tìm user theo username chuẩn hóa — bao gồm password_hash để verify.
   * Chỉ được gọi trong auth flow, không được dùng ở nơi khác.
   */
  async findUserByUsername(username: string) {
    return this.prisma.users.findUnique({
      where: { username },
      select: {
        id: true,
        employee_code: true,
        username: true,
        full_name: true,
        email: true,
        password_hash: true,
        status: true,
        deleted_at: true,
      },
    });
  }

  /**
   * Lấy thông tin user hiện tại để trả về trong GET /auth/me.
   * Không bao gồm password_hash.
   */
  async findAuthUserById(id: string) {
    const now = new Date();
    return this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        employee_code: true,
        full_name: true,
        email: true,
        status: true,
        department_id: true,
        deleted_at: true,
        user_roles_user_roles_user_idTousers: {
          where: { AND: [{ OR: [{ expires_at: null }, { expires_at: { gt: now } }] }, { roles: { status: 'ACTIVE' } }] },
          select: { scope_type: true, scope_id: true, roles: { select: { code: true, role_permissions: { select: { permissions: { select: { code: true } } } } } } },
        },
      },
    });
  }

  async findUserById(id: string) {
    return this.findAuthUserById(id);
  }

  async findUserCredentialsById(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        password_hash: true,
        status: true,
        deleted_at: true,
      },
    });
  }

  async updateOwnProfile(data: {
    userId: string;
    fullName: string;
    ipAddress: string;
    userAgent: string;
  }) {
    return this.prisma.$transaction(async (db) => {
      const current = await db.users.findUnique({
        where: { id: data.userId },
        select: { full_name: true },
      });
      if (!current) throw new Error('User disappeared during profile update.');
      await db.users.update({
        where: { id: data.userId },
        data: { full_name: data.fullName, updated_at: new Date() },
      });
      await db.audit_logs.create({
        data: {
          user_id: data.userId,
          module: 'auth',
          entity_type: 'users',
          entity_id: data.userId,
          action: 'SELF_PROFILE_UPDATED',
          old_data: { fullName: current.full_name },
          new_data: { fullName: data.fullName },
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async changeOwnPassword(data: {
    userId: string;
    passwordHash: string;
    ipAddress: string;
    userAgent: string;
  }) {
    return this.prisma.$transaction(async (db) => {
      await db.users.update({
        where: { id: data.userId },
        data: { password_hash: data.passwordHash, updated_at: new Date() },
      });
      await db.auth_refresh_tokens.updateMany({
        where: { user_id: data.userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await db.audit_logs.create({
        data: {
          user_id: data.userId,
          module: 'auth',
          entity_type: 'users',
          entity_id: data.userId,
          action: 'SELF_PASSWORD_CHANGED',
          new_data: { sessionsRevoked: true },
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
        },
      });
    });
  }

  /** Lưu hash của refresh token vào DB */
  async saveRefreshToken(data: SaveRefreshTokenData) {
    return this.prisma.auth_refresh_tokens.create({
      data: {
        user_id: data.userId,
        token_hash: data.tokenHash,
        jti: data.jti,
        expires_at: data.expiresAt,
        user_agent: data.userAgent ?? null,
        ip_address: data.ipAddress ?? null,
      },
    });
  }

  /** Tìm refresh token record theo jti */
  async findRefreshTokenByJti(jti: string) {
    return this.prisma.auth_refresh_tokens.findUnique({
      where: { jti },
    });
  }

  /** Revoke một refresh token theo jti */
  async revokeRefreshToken(jti: string) {
    return this.prisma.auth_refresh_tokens.update({
      where: { jti },
      data: { revoked_at: new Date() },
    });
  }

  /** Revoke tất cả refresh token của một user (logout toàn bộ device) */
  async revokeAllUserTokens(userId: string) {
    return this.prisma.auth_refresh_tokens.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });
  }

  /** Ghi audit log */
  async createAuditLog(data: {
    userId?: string;
    module: string;
    entityType: string;
    entityId?: string;
    action: string;
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.audit_logs.create({
      data: {
        user_id: data.userId ?? null,
        module: data.module,
        entity_type: data.entityType,
        entity_id: data.entityId ?? null,
        action: data.action,
        old_data: data.oldData ? (data.oldData as Prisma.InputJsonValue) : Prisma.DbNull,
        new_data: data.newData ? (data.newData as Prisma.InputJsonValue) : Prisma.DbNull,
        ip_address: data.ipAddress ?? null,
        user_agent: data.userAgent ?? null,
      },
    });
  }

  /** Cập nhật last_login_at cho user */
  async updateLastLogin(userId: string) {
    return this.prisma.users.update({
      where: { id: userId },
      data: { last_login_at: new Date() },
    });
  }
}
