import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertE2eDatabase } from './environment';

export const STATE_DIR = path.resolve('e2e/.state');
export const STATE_FILE = path.join(STATE_DIR, 'fixture.json');
export const PASSWORD = 'BscE2e!Test#1';

export type FixtureState = {
  marker: string;
  password: string;
  mainDepartmentId: string;
  otherDepartmentId: string;
  positionId: string;
  manager: { id: string; email: string };
  employee: { id: string; email: string };
  outsideManager: { id: string; email: string };
  cycleIds: { flow: string; underweight: string; performance: string[]; duplicateTargets: string[] };
  bscIds: { reopenEvaluation: string; reopenPlan: string; duplicateSource: string };
  createdPermissionIds: string[];
};

export function prisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: assertE2eDatabase(process.env.TEST_DATABASE_URL) } } });
}

export async function saveState(state: FixtureState) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function readState(): Promise<FixtureState> {
  return JSON.parse(await readFile(STATE_FILE, 'utf8')) as FixtureState;
}

export async function removeState() { await rm(STATE_DIR, { recursive: true, force: true }); }

export async function cleanupFixture(db: PrismaClient, state: FixtureState) {
  const userIds = [state.manager.id, state.employee.id, state.outsideManager.id];
  const bscIds = (await db.employee_bsc.findMany({
    where: { OR: [{ employee_id: { in: userIds } }, { bsc_code: { startsWith: state.marker } }] },
    select: { id: true },
  })).map((row) => row.id);
  const roleIds = (await db.roles.findMany({ where: { code: { startsWith: state.marker } }, select: { id: true } })).map((row) => row.id);
  await db.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
  await db.employee_bsc.deleteMany({ where: { OR: [{ employee_id: { in: userIds } }, { bsc_code: { startsWith: state.marker } }] } });
  await db.bsc_cycles.deleteMany({ where: { code: { startsWith: state.marker } } });
  await db.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: userIds } }, { manager_id: { in: userIds } }] } });
  await db.auth_refresh_tokens.deleteMany({ where: { user_id: { in: userIds } } });
  await db.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
  await db.users.deleteMany({ where: { id: { in: userIds } } });
  await db.roles.deleteMany({ where: { code: { startsWith: state.marker } } });
  if (state.createdPermissionIds.length) await db.permissions.deleteMany({ where: { id: { in: state.createdPermissionIds }, role_permissions: { none: {} } } });
  await db.departments.deleteMany({ where: { code: { startsWith: state.marker } } });
  await db.positions.deleteMany({ where: { code: { startsWith: state.marker } } });

  const [users, roles, departments, positions, cycles, bscs, audits, histories, reviews, approvalSteps, items, versions, reopenRequests,
    relationships, assignments, rolePermissions, refreshTokens, createdPermissions] = await Promise.all([
    db.users.count({ where: { employee_code: { startsWith: state.marker } } }),
    db.roles.count({ where: { code: { startsWith: state.marker } } }),
    db.departments.count({ where: { code: { startsWith: state.marker } } }),
    db.positions.count({ where: { code: { startsWith: state.marker } } }),
    db.bsc_cycles.count({ where: { code: { startsWith: state.marker } } }),
    db.employee_bsc.count({ where: { OR: [{ employee_id: { in: userIds } }, { bsc_code: { startsWith: state.marker } }] } }),
    db.audit_logs.count({ where: { user_id: { in: userIds } } }),
    db.bsc_status_histories.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.bsc_reviews.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.bsc_approval_steps.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.employee_bsc_items.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.bsc_versions.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.bsc_unlock_requests.count({ where: { employee_bsc_id: { in: bscIds } } }),
    db.manager_relationships.count({ where: { OR: [{ employee_id: { in: userIds } }, { manager_id: { in: userIds } }] } }),
    db.user_roles.count({ where: { user_id: { in: userIds } } }),
    db.role_permissions.count({ where: { role_id: { in: roleIds } } }),
    db.auth_refresh_tokens.count({ where: { user_id: { in: userIds } } }),
    state.createdPermissionIds.length ? db.permissions.count({ where: { id: { in: state.createdPermissionIds } } }) : Promise.resolve(0),
  ]);
  const remaining = { users, roles, departments, positions, cycles, bscs, audits, histories, reviews, approvalSteps,
    items, versions, reopenRequests, relationships, assignments, rolePermissions, refreshTokens, createdPermissions };
  if (Object.values(remaining).some((count) => count !== 0)) {
    throw new Error(`E2E fixture cleanup incomplete: ${JSON.stringify(remaining)}`);
  }
}
