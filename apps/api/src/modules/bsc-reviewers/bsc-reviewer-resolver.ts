import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface DirectorReviewAssignment {
  id: string;
  role: 'DIRECTOR';
}

export interface ResolveDirectorReviewInput {
  ownerId: string;
  permission: string;
}

@Injectable()
export class BscReviewerResolver {
  async resolveRequiredDirector(
    db: Prisma.TransactionClient,
    input: ResolveDirectorReviewInput,
  ): Promise<DirectorReviewAssignment> {
    const now = new Date();
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
              role_permissions: { some: { permissions: { code: input.permission } } },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 2,
    });

    if (directors.length === 0) {
      throw new BadRequestException({
        code: 'BSC_DIRECTOR_REVIEWER_REQUIRED',
        message: 'Không xác định được Giám đốc duyệt BSC đang có hiệu lực.',
      });
    }
    if (directors.length > 1) {
      throw new ConflictException({
        code: 'BSC_DIRECTOR_REVIEWER_AMBIGUOUS',
        message: 'Có nhiều Giám đốc đủ điều kiện duyệt BSC. Cần cấu hình một người duyệt chính.',
      });
    }
    return { id: directors[0].id, role: 'DIRECTOR' };
  }
}
