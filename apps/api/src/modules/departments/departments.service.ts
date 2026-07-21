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
  async managerAssignment(actor: AuthUser, departmentId: string) {
    this.assertGlobal(actor); await this.findOne(actor, departmentId); const now = new Date();
    const assignment = await this.prisma.department_manager_assignments.findFirst({ where: { department_id: departmentId, is_primary: true, start_date: { lte: now }, OR: [{ end_date: null }, { end_date: { gt: now } }] }, orderBy: { start_date: 'desc' } });
    if (!assignment) return null;
    const manager = await this.prisma.users.findUnique({ where: { id: assignment.manager_id }, select: { id: true, employee_code: true, full_name: true, email: true, status: true } });
    return { ...assignment, manager };
  }
  async setManagerAssignment(actor: AuthUser, departmentId: string, managerId: string, rawReason: string) {
    this.assertGlobal(actor); const department = await this.findOne(actor, departmentId); if (department.status !== 'ACTIVE') throw new BadRequestException({ code: 'DEPARTMENT_INACTIVE', message: 'Chỉ được phân công trưởng phòng cho đơn vị đang hoạt động.' });
    const reason = rawReason.trim().replace(/<[^>]*>/g, '').trim(); if (!reason) throw new BadRequestException({ code: 'DEPARTMENT_MANAGER_REASON_REQUIRED', message: 'Lý do phân công là bắt buộc.' });
    const manager = await this.prisma.users.findFirst({ where: { id: managerId, department_id: departmentId, status: 'ACTIVE', deleted_at: null,
      user_roles_user_roles_user_idTousers: { some: { scope_type: 'DEPARTMENT', scope_id: departmentId,
        roles: { status: 'ACTIVE', role_permissions: { some: { permissions: { code: 'bsc.department.create' } } } },
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] } } } });
    if (!manager) throw new BadRequestException({ code: 'DEPARTMENT_MANAGER_INVALID', message: 'Trưởng phòng phải là MANAGER đang hoạt động trong đúng phòng ban.' });
    const now = new Date();
    return this.prisma.$transaction(async (db) => {
      const current = await db.department_manager_assignments.findFirst({ where: { department_id: departmentId, is_primary: true, end_date: null }, orderBy: { start_date: 'desc' } });
      if (current?.manager_id === managerId) return { ...current, manager };
      if (current) await db.department_manager_assignments.update({ where: { id: current.id }, data: { end_date: now } });
      const assignment = await db.department_manager_assignments.create({ data: { department_id: departmentId, manager_id: managerId, start_date: now, is_primary: true, assigned_by: actor.id } });
      const handovers = await db.department_bsc.findMany({ where: { department_id: departmentId, evaluation_status: { not: 'APPROVED' }, responsible_manager_id: { not: managerId } }, select: { id: true, responsible_manager_id: true } });
      const handedOver = await db.department_bsc.updateMany({ where: { id: { in: handovers.map((row) => row.id) } }, data: { responsible_manager_id: managerId, updated_at: now } });
      for (const row of handovers) await db.audit_logs.create({ data: { user_id: actor.id, module: 'bsc', entity_type: 'department_bsc', entity_id: row.id,
        action: 'DEPARTMENT_BSC_MANAGER_HANDOVER', old_data: { responsibleManagerId: row.responsible_manager_id }, new_data: { responsibleManagerId: managerId, reason } } });
      await db.audit_logs.create({ data: { user_id: actor.id, module: 'organization', entity_type: 'department_manager_assignment', entity_id: assignment.id,
        action: 'DEPARTMENT_MANAGER_ASSIGNED', old_data: current ? { managerId: current.manager_id } : Prisma.JsonNull,
        new_data: { departmentId, managerId, reason, handedOverBscCount: handedOver.count } } });
      return { ...assignment, manager };
    });
  }
}
