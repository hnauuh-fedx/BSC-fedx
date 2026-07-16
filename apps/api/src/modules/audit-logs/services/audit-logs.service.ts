import { ForbiddenException, Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../../../database/prisma.service';
import { AuthUser } from '../../../common/types/auth-user.type';
import { ResourceScopePolicy } from '../../../common/policies/resource-scope.policy';

// ─── Query DTO ────────────────────────────────────────────────────────────

export class AuditLogQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() module?: string;
  @IsOptional() action?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(200) limit = 50;
  @IsOptional() @IsIn(['created_at']) sortBy: 'created_at' = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}

// ─── Redaction ────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordHash',
  'token', 'accessToken', 'refreshToken', 'access_token', 'refresh_token',
  'token_hash', 'tokenHash',
  'secret', 'authorization', 'Authorization',
  'cookie', 'Cookie',
  'DATABASE_URL', 'database_url', 'databaseUrl',
]);

function redactValue(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactValue);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactValue(value);
  }
  return result;
}

function formatEntry(entry: {
  id: string;
  user_id: string | null;
  module: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  users: { id: string; full_name: string; email: string } | null;
}) {
  return {
    id: entry.id,
    actorId: entry.user_id,
    actorName: entry.users?.full_name ?? null,
    actorEmail: entry.users?.email ?? null,
    module: entry.module,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    action: entry.action,
    oldData: redactValue(entry.old_data),
    newData: redactValue(entry.new_data),
    ipAddress: entry.ip_address,
    userAgent: entry.user_agent,
    createdAt: entry.created_at,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ResourceScopePolicy,
  ) {}

  private buildScopeFilter(actor: AuthUser) {
    // GLOBAL scope → truy cập tất cả audit logs
    if (this.scope.canAccessGlobal(actor)) return {};

    // DEPARTMENT scope → logs của users trong department đó
    const scopedDepartments = actor.roles
      .filter((r) => r.scopeType === 'DEPARTMENT' && r.scopeId)
      .map((r) => r.scopeId!);

    if (scopedDepartments.length > 0) {
      return {
        users: {
          department_id: { in: scopedDepartments },
        },
      };
    }

    // SELF → chỉ log của chính mình
    return { user_id: actor.id };
  }

  async findAll(actor: AuthUser, query: AuditLogQueryDto) {
    if (!actor.permissions.includes('audit.view')) {
      throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem audit log.' });
    }

    const scopeFilter = this.buildScopeFilter(actor);

    const where: Record<string, unknown> = { ...scopeFilter };
    if (query.from || query.to) {
      where['created_at'] = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.module) where['module'] = query.module;
    if (query.action) where['action'] = { contains: query.action, mode: 'insensitive' };
    if (query.actorId) where['user_id'] = query.actorId;
    if (query.entityId) where['entity_id'] = query.entityId;

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.audit_logs.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        select: {
          id: true,
          user_id: true,
          module: true,
          entity_type: true,
          entity_id: true,
          action: true,
          old_data: true,
          new_data: true,
          ip_address: true,
          user_agent: true,
          created_at: true,
          users: { select: { id: true, full_name: true, email: true } },
        },
      }),
      this.prisma.audit_logs.count({ where }),
    ]);

    return {
      items: items.map(formatEntry),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async findOne(actor: AuthUser, id: string) {
    if (!actor.permissions.includes('audit.view')) {
      throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem audit log.' });
    }

    const entry = await this.prisma.audit_logs.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        module: true,
        entity_type: true,
        entity_id: true,
        action: true,
        old_data: true,
        new_data: true,
        ip_address: true,
        user_agent: true,
        created_at: true,
        users: { select: { id: true, full_name: true, email: true } },
      },
    });

    if (!entry) {
      throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Không tìm thấy audit log.' });
    }

    // Kiểm tra scope: nếu không GLOBAL, đảm bảo entry thuộc scope của actor
    if (!this.scope.canAccessGlobal(actor)) {
      const scopedDepartments = actor.roles
        .filter((r) => r.scopeType === 'DEPARTMENT' && r.scopeId)
        .map((r) => r.scopeId!);

      if (scopedDepartments.length > 0 && entry.user_id) {
        const entryUser = await this.prisma.users.findUnique({
          where: { id: entry.user_id },
          select: { department_id: true },
        });
        if (!entryUser || !scopedDepartments.includes(entryUser.department_id)) {
          throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Không tìm thấy audit log.' });
        }
      } else if (!entry.user_id || entry.user_id !== actor.id) {
        throw new ForbiddenException({ code: 'AUTH_SCOPE_DENIED', message: 'Không tìm thấy audit log.' });
      }
    }

    return formatEntry(entry);
  }

  /** Trả danh sách modules có trong audit log (để dùng làm filter options) */
  async findModules(actor: AuthUser) {
    if (!actor.permissions.includes('audit.view')) {
      throw new ForbiddenException({ code: 'AUTH_PERMISSION_DENIED', message: 'Bạn không có quyền xem audit log.' });
    }

    const result = await this.prisma.audit_logs.findMany({
      distinct: ['module'],
      select: { module: true },
      orderBy: { module: 'asc' },
    });

    return result.map((r) => r.module);
  }
}
