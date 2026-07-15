import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user.type';
import { BSC_PERMISSIONS } from '../employee-bsc/policies/bsc-access.policy';
import { BscCycleResponse } from './bsc-cycles.types';

const cycleSelect = {
  id: true,
  name: true,
  year: true,
  month: true,
  status: true,
  start_date: true,
  end_date: true,
} as const;

@Injectable()
export class BscCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOpen(actor: AuthUser): Promise<BscCycleResponse[]> {
    if (!await this.isEligibleForOpenCycles(actor)) return [];
    const cycles = await this.prisma.bsc_cycles.findMany({
      where: { status: 'OPEN' },
      select: cycleSelect,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { start_date: 'desc' }],
    });
    return cycles.map(this.toResponse);
  }

  private async isEligibleForOpenCycles(actor: AuthUser): Promise<boolean> {
    const canView = [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.VIEW_UNIT]
      .some((permission) => actor.permissions.includes(permission));
    if (canView) return true;
    if (!actor.permissions.includes(BSC_PERMISSIONS.CREATE_OWN)) return false;
    if (actor.roles.some((role) => role.code === 'ADMIN' || role.code === 'DIRECTOR')) return false;

    const owner = await this.prisma.users.findUnique({
      where: { id: actor.id },
      select: {
        status: true, deleted_at: true, direct_manager_id: true,
        departments: { select: { status: true } }, positions: { select: { status: true } },
        users: { select: { status: true, deleted_at: true } },
      },
    });
    return Boolean(owner && owner.status === 'ACTIVE' && !owner.deleted_at
      && owner.departments.status === 'ACTIVE' && owner.positions.status === 'ACTIVE'
      && owner.direct_manager_id && owner.users?.status === 'ACTIVE' && !owner.users.deleted_at);
  }

  async findOne(id: string): Promise<BscCycleResponse> {
    const cycle = await this.prisma.bsc_cycles.findUnique({ where: { id }, select: cycleSelect });
    if (!cycle) throw new NotFoundException({ code: 'BSC_CYCLE_NOT_FOUND', message: 'Không tìm thấy kỳ BSC.' });
    return this.toResponse(cycle);
  }

  private toResponse(cycle: { id: string; name: string; year: number; month: number | null; status: string; start_date: Date; end_date: Date }): BscCycleResponse {
    return { id: cycle.id, name: cycle.name, year: cycle.year, month: cycle.month, status: cycle.status, startDate: cycle.start_date, endDate: cycle.end_date };
  }
}
