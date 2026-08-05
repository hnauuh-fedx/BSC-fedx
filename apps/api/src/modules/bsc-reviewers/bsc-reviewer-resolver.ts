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

export interface DirectorReviewAssignment {
  id: string;
  role: 'DIRECTOR';
}

export interface ResolveDirectorReviewInput {
  ownerId: string;
  permission: string | readonly string[];
}

@Injectable()
export class BscReviewerResolver {
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
}
