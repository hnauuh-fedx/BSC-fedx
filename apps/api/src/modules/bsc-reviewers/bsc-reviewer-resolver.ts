import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/types/auth-user.type';

export const DIRECTOR_REVIEW_PERMISSIONS = {
  PLAN: ['bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate'],
  EVALUATION: ['bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate'],
  REOPEN: ['bsc.reopen.subordinate'],
} as const;

export function hasGlobalDirectorPermission(actor: AuthUser, permissions: readonly string[]): boolean {
  return actor.roles.some((role) => role.code === 'DIRECTOR'
    && role.scopeType === 'GLOBAL'
    && permissions.some((permission) => role.permissions?.includes(permission)));
}

export function hasDepartmentManagerPermission(
  actor: AuthUser,
  permissions: readonly string[],
  departmentId = actor.departmentId,
): boolean {
  return actor.roles.some((role) => role.code === 'MANAGER'
    && role.scopeType === 'DEPARTMENT'
    && role.scopeId === departmentId
    && permissions.some((permission) => role.permissions?.includes(permission)));
}

export function hasBusinessReviewerPermission(
  actor: AuthUser,
  permissions: readonly string[],
  departmentId: string,
): boolean {
  return hasGlobalDirectorPermission(actor, permissions)
    || hasDepartmentManagerPermission(actor, permissions, departmentId);
}

export interface DirectorReviewAssignment {
  id: string;
  role: 'DIRECTOR';
}

export interface DepartmentManagerReviewAssignment {
  id: string;
  role: 'MANAGER';
}

export type BscReviewAssignment = DirectorReviewAssignment | DepartmentManagerReviewAssignment;
export type BscReviewStage = 'PLAN' | 'EVALUATION';

export interface ResolveDirectorReviewInput {
  ownerId: string;
  permission: string | readonly string[];
}

export interface ResolveReviewInput extends ResolveDirectorReviewInput {
  departmentId: string;
  stage: BscReviewStage;
}

@Injectable()
export class BscReviewerResolver {
  async resolveRequiredReviewers(
    db: Prisma.TransactionClient,
    input: ResolveReviewInput,
  ): Promise<BscReviewAssignment[]> {
    const route = await db.employee_bsc_approval_routes.findUnique({
      where: {
        department_id_stage: {
          department_id: input.departmentId,
          stage: input.stage,
        },
      },
      select: { reviewer_type: true },
    });
    if (route?.reviewer_type !== 'DEPARTMENT_MANAGER') {
      return this.resolveRequiredDirectors(db, input);
    }

    if (await this.ownerHasActiveManagerRole(db, input.ownerId)) {
      return this.resolveRequiredDirectors(db, input);
    }
    const activeManagers = await this.resolveActiveDepartmentManagers(db, input.departmentId);
    if (activeManagers.some(({ manager_id }) => manager_id === input.ownerId)) {
      return this.resolveRequiredDirectors(db, input);
    }
    const managers = await this.resolveEligibleDepartmentManagers(db, input);
    if (managers.length === 0) {
      throw new BadRequestException({
        code: 'BSC_DEPARTMENT_MANAGER_REVIEWER_REQUIRED',
        message: 'Không xác định được Trưởng phòng đủ quyền duyệt BSC đang có hiệu lực.',
      });
    }
    if (managers.length > 1) {
      throw new BadRequestException({
        code: 'BSC_DEPARTMENT_MANAGER_REVIEWER_AMBIGUOUS',
        message: 'Phòng ban đang có nhiều Trưởng phòng đủ điều kiện duyệt BSC.',
      });
    }
    return [{ id: managers[0].manager_id, role: 'MANAGER' }];
  }

  private async ownerHasActiveManagerRole(db: Prisma.TransactionClient, ownerId: string): Promise<boolean> {
    const now = new Date();
    return (await db.user_roles.count({ where: {
      user_id: ownerId,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      roles: { code: 'MANAGER', status: 'ACTIVE' },
    } })) > 0;
  }

  private resolveActiveDepartmentManagers(db: Prisma.TransactionClient, departmentId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return db.department_manager_assignments.findMany({
      where: {
        department_id: departmentId,
        is_primary: true,
        start_date: { lte: today },
        OR: [{ end_date: null }, { end_date: { gte: today } }],
        users_department_manager_assignments_manager_idTousers: {
          status: 'ACTIVE',
          deleted_at: null,
          department_id: departmentId,
          departments: { status: 'ACTIVE' },
          positions: { status: 'ACTIVE' },
        },
      },
      select: { manager_id: true },
      orderBy: { manager_id: 'asc' },
    });
  }

  async resolveRequiredDirectors(
    db: Prisma.TransactionClient,
    input: ResolveDirectorReviewInput,
  ): Promise<DirectorReviewAssignment[]> {
    const now = new Date();
    const permissions = typeof input.permission === 'string' ? [input.permission] : [...input.permission];
    const directors = await db.users.findMany({
      where: {
        id: { not: input.ownerId },
        status: 'ACTIVE',
        deleted_at: null,
        departments: { status: 'ACTIVE' },
        positions: { status: 'ACTIVE' },
        user_roles_user_roles_user_idTousers: {
          some: {
            scope_type: 'GLOBAL',
            scope_id: null,
            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            roles: {
              code: 'DIRECTOR',
              status: 'ACTIVE',
              role_permissions: { some: { permissions: { code: { in: permissions } } } },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (directors.length === 0) {
      throw new BadRequestException({
        code: 'BSC_DIRECTOR_REVIEWER_REQUIRED',
        message: 'Không xác định được Giám đốc duyệt BSC đang có hiệu lực.',
      });
    }
    return directors.map(({ id }) => ({ id, role: 'DIRECTOR' }));
  }

  private resolveEligibleDepartmentManagers(db: Prisma.TransactionClient, input: ResolveReviewInput) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const permissions = typeof input.permission === 'string' ? [input.permission] : [...input.permission];
    return db.department_manager_assignments.findMany({
      where: {
        department_id: input.departmentId,
        is_primary: true,
        start_date: { lte: today },
        OR: [{ end_date: null }, { end_date: { gte: today } }],
        users_department_manager_assignments_manager_idTousers: {
          status: 'ACTIVE',
          deleted_at: null,
          department_id: input.departmentId,
          departments: { status: 'ACTIVE' },
          positions: { status: 'ACTIVE' },
          user_roles_user_roles_user_idTousers: {
            some: {
              scope_type: 'DEPARTMENT',
              scope_id: input.departmentId,
              OR: [{ expires_at: null }, { expires_at: { gt: now } }],
              roles: {
                code: 'MANAGER',
                status: 'ACTIVE',
                role_permissions: { some: { permissions: { code: { in: permissions } } } },
              },
            },
          },
        },
      },
      select: { manager_id: true },
      orderBy: { manager_id: 'asc' },
    });
  }
}
