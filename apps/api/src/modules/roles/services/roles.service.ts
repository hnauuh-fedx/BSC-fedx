import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuthUser } from '../../../common/types/auth-user.type';

// ─── Redaction helper ──────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordHash', 'token', 'accessToken',
  'refreshToken', 'access_token', 'refresh_token', 'secret', 'authorization',
  'cookie', 'DATABASE_URL', 'database_url',
]);

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactObject(value);
  }
  return result;
}

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /roles — danh sách tất cả roles (không filter scope vì roles là config toàn cục) */
  async findAll() {
    const roles = await this.prisma.roles.findMany({
      orderBy: { hierarchy_level: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        hierarchy_level: true,
        description: true,
        is_system: true,
        status: true,
        created_at: true,
        updated_at: true,
        _count: { select: { role_permissions: true } },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      hierarchyLevel: role.hierarchy_level,
      description: role.description,
      isSystem: role.is_system,
      status: role.status,
      permissionCount: role._count.role_permissions,
      createdAt: role.created_at,
      updatedAt: role.updated_at,
    }));
  }

  /** GET /roles/:id — chi tiết role kèm permissions grouped by module */
  async findOne(id: string) {
    const role = await this.prisma.roles.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        hierarchy_level: true,
        description: true,
        is_system: true,
        status: true,
        created_at: true,
        updated_at: true,
        role_permissions: {
          select: {
            permissions: {
              select: { id: true, code: true, name: true, module: true, description: true },
            },
          },
          orderBy: { permissions: { module: 'asc' } },
        },
      },
    });

    if (!role) throw new NotFoundException('Không tìm thấy vai trò.');

    // Group permissions by module
    const byModule: Record<string, { id: string; code: string; name: string; description: string | null }[]> = {};
    for (const rp of role.role_permissions) {
      const p = rp.permissions;
      if (!byModule[p.module]) byModule[p.module] = [];
      byModule[p.module].push({ id: p.id, code: p.code, name: p.name, description: p.description });
    }

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      hierarchyLevel: role.hierarchy_level,
      description: role.description,
      isSystem: role.is_system,
      status: role.status,
      createdAt: role.created_at,
      updatedAt: role.updated_at,
      permissionsByModule: Object.entries(byModule).map(([module, permissions]) => ({
        module,
        permissions,
      })),
    };
  }

  /** GET /permissions — tất cả permissions available trong hệ thống */
  async findAllPermissions() {
    const permissions = await this.prisma.permissions.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, module: true, description: true },
    });

    // Group by module
    const byModule: Record<string, { id: string; code: string; name: string; description: string | null }[]> = {};
    for (const p of permissions) {
      if (!byModule[p.module]) byModule[p.module] = [];
      byModule[p.module].push({ id: p.id, code: p.code, name: p.name, description: p.description });
    }

    return Object.entries(byModule).map(([module, items]) => ({ module, permissions: items }));
  }

  /**
   * PUT /roles/:id/permissions — thay thế toàn bộ permission assignment cho role.
   * - Actor không thể cấp permission mà chính actor không có.
   * - Ghi audit với old/new permission codes.
   */
  async updatePermissions(actor: AuthUser, roleId: string, permissionIds: string[]) {
    // 1. Kiểm tra role tồn tại
    const role = await this.prisma.roles.findUnique({
      where: { id: roleId },
      select: { id: true, code: true, status: true },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò.');

    // 2. Loại bỏ duplicate IDs
    const uniqueIds = [...new Set(permissionIds)];

    // 3. Xác minh tất cả permission IDs tồn tại
    if (uniqueIds.length > 0) {
      const found = await this.prisma.permissions.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, code: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException({ code: 'PERMISSION_NOT_FOUND', message: 'Một hoặc nhiều permission không tồn tại.' });
      }

      // 4. Actor không thể gán permission mà actor không có
      const actorPermissionSet = new Set(actor.permissions);
      const forbiddenCodes = found.filter((p) => !actorPermissionSet.has(p.code)).map((p) => p.code);
      if (forbiddenCodes.length > 0) {
        throw new ForbiddenException({
          code: 'PERMISSION_ESCALATION',
          message: `Bạn không thể gán các permission ngoài quyền của mình: ${forbiddenCodes.join(', ')}.`,
        });
      }
    }

    // 5. Lấy old permissions trước khi update
    const oldPermissions = await this.prisma.role_permissions.findMany({
      where: { role_id: roleId },
      select: { permissions: { select: { code: true } } },
    });
    const oldCodes = oldPermissions.map((rp) => rp.permissions.code).sort();

    // 6. Lấy new permission codes để ghi audit
    const newPermissions = uniqueIds.length > 0
      ? await this.prisma.permissions.findMany({
          where: { id: { in: uniqueIds } },
          select: { code: true },
        })
      : [];
    const newCodes = newPermissions.map((p) => p.code).sort();

    // 7. Atomic update trong transaction
    await this.prisma.$transaction(async (db) => {
      // Xóa tất cả permission cũ
      await db.role_permissions.deleteMany({ where: { role_id: roleId } });

      // Thêm permissions mới
      if (uniqueIds.length > 0) {
        await db.role_permissions.createMany({
          data: uniqueIds.map((permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })),
          skipDuplicates: true,
        });
      }

      // Ghi audit
      await db.audit_logs.create({
        data: {
          user_id: actor.id,
          module: 'roles',
          entity_type: 'role',
          entity_id: roleId,
          action: 'ROLE_PERMISSIONS_UPDATED',
          old_data: { roleCode: role.code, permissions: oldCodes },
          new_data: { roleCode: role.code, permissions: newCodes },
        },
      });
    });

    // 8. Trả trạng thái cuối từ database
    return this.findOne(roleId);
  }
}
