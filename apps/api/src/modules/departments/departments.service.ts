import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user.type';
import { ResourceScopePolicy } from '../../common/policies/resource-scope.policy';
import { DepartmentMutationDto, DepartmentQueryDto, UpdateDepartmentDto } from './departments.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ResourceScopePolicy) {}
  private async audit(actor: AuthUser, action: string, entityId: string, oldData: unknown, newData: unknown) {
    await this.prisma.audit_logs.create({ data: { user_id: actor.id, module: 'organization', entity_type: 'department', entity_id: entityId, action, old_data: oldData as Prisma.InputJsonValue, new_data: newData as Prisma.InputJsonValue } });
  }
  private assertGlobal(actor: AuthUser) { this.scope.assertResourceScope(actor, {}); }
  private async ensureParent(parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException({ code: 'DEPARTMENT_CYCLE', message: 'Đơn vị không thể là đơn vị cha của chính nó.' });
    const parent = await this.prisma.departments.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException({ code: 'DEPARTMENT_PARENT_NOT_FOUND', message: 'Không tìm thấy đơn vị cha.' });
    if (parent.status !== 'ACTIVE') throw new BadRequestException({ code: 'DEPARTMENT_PARENT_INACTIVE', message: 'Đơn vị cha phải đang hoạt động.' });
    let cursor: string | null = parent.parent_id;
    while (cursor) { if (cursor === selfId) throw new BadRequestException({ code: 'DEPARTMENT_CYCLE', message: 'Không thể tạo vòng lặp trong cây đơn vị.' }); const node = await this.prisma.departments.findUnique({ where: { id: cursor }, select: { parent_id: true } }); cursor = node?.parent_id ?? null; }
  }
  async findAll(actor: AuthUser, q: DepartmentQueryDto) {
    this.assertGlobal(actor);
    const where: Prisma.departmentsWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.departments.findMany({ where, include: { departments: { select: { id: true, code: true, name: true } }, _count: { select: { other_departments: true, users: true } } }, orderBy: { [q.sortBy]: q.sortOrder }, skip: (q.page - 1) * q.limit, take: q.limit }), this.prisma.departments.count({ where })]);
    return { items, page: q.page, limit: q.limit, total };
  }
  async tree(actor: AuthUser) { this.assertGlobal(actor); return this.prisma.departments.findMany({ orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, parent_id: true, status: true } }); }
  async findOne(actor: AuthUser, id: string) { this.assertGlobal(actor); const item = await this.prisma.departments.findUnique({ where: { id }, include: { departments: true, _count: { select: { other_departments: true, users: true } } } }); if (!item) throw new NotFoundException('Không tìm thấy đơn vị.'); return item; }
  async create(actor: AuthUser, dto: DepartmentMutationDto) { this.assertGlobal(actor); await this.ensureParent(dto.parentId); try { const item = await this.prisma.departments.create({ data: { code: dto.code.trim().toUpperCase(), name: dto.name.trim(), parent_id: dto.parentId ?? null } }); await this.audit(actor, 'DEPARTMENT_CREATED', item.id, null, { code: item.code, name: item.name, parentId: item.parent_id }); return item; } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException({ code: 'DEPARTMENT_CODE_EXISTS', message: 'Mã đơn vị đã tồn tại.' }); throw e; } }
  async update(actor: AuthUser, id: string, dto: UpdateDepartmentDto) { this.assertGlobal(actor); const old = await this.findOne(actor, id); if (dto.parentId !== undefined) await this.ensureParent(dto.parentId, id); try { const item = await this.prisma.departments.update({ where: { id }, data: { ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}), ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.parentId !== undefined ? { parent_id: dto.parentId } : {}), updated_at: new Date() } }); await this.audit(actor, 'DEPARTMENT_UPDATED', id, { code: old.code, name: old.name, parentId: old.parent_id }, { code: item.code, name: item.name, parentId: item.parent_id }); return item; } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException({ code: 'DEPARTMENT_CODE_EXISTS', message: 'Mã đơn vị đã tồn tại.' }); throw e; } }
  async setStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'INACTIVE') { this.assertGlobal(actor); const old = await this.findOne(actor, id); if (status === 'INACTIVE') { const [children, users] = await Promise.all([this.prisma.departments.count({ where: { parent_id: id, status: 'ACTIVE' } }), this.prisma.users.count({ where: { department_id: id, status: 'ACTIVE', deleted_at: null } })]); if (children) throw new BadRequestException({ code: 'DEPARTMENT_HAS_ACTIVE_CHILDREN', message: 'Không thể ngừng hoạt động đơn vị còn đơn vị con đang hoạt động.' }); if (users) throw new BadRequestException({ code: 'DEPARTMENT_HAS_ACTIVE_USERS', message: 'Không thể ngừng hoạt động đơn vị còn người dùng đang hoạt động.' }); } const item = await this.prisma.departments.update({ where: { id }, data: { status, updated_at: new Date() } }); await this.audit(actor, status === 'ACTIVE' ? 'DEPARTMENT_ACTIVATED' : 'DEPARTMENT_DEACTIVATED', id, { status: old.status }, { status }); return item; }
}
