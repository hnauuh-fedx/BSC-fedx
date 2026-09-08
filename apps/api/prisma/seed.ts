import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { isValidUsername, normalizeUsername } from '../src/common/username';
import { BscReviewerResolver } from '../src/modules/bsc-reviewers/bsc-reviewer-resolver';
import { transferOpenEmployeeBsc } from '../src/modules/users/employee-bsc-organization-transfer';

export const CANONICAL_ADMIN_PERMISSIONS = [
  'user.view', 'user.create', 'user.update', 'user.lock', 'user.password.reset',
  'department.view', 'department.manage', 'position.view', 'position.manage',
  'role.view', 'role.manage', 'permission.view', 'permission.assign',
  'bsc.period.view', 'bsc.period.manage', 'bsc.template.view', 'bsc.template.manage', 'audit.view',
] as const;

export const CANONICAL_BSC_DRAFT_PERMISSIONS = [
  'bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own',
  'bsc.view.subordinate', 'bsc.view.unit', 'bsc.kpi.manage.subordinate', 'bsc.actual.update.own',
] as const;

export const CANONICAL_BSC_WORKFLOW_PERMISSIONS = [
  'bsc.plan.submit.own', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate',
  'bsc.evaluation.submit.own', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate',
  'bsc.plan.history.view', 'bsc.evaluation.history.view',
  'bsc.reopen.request', 'bsc.reopen.subordinate', 'bsc.version.view', 'bsc.duplicate.own',
  'bsc.reset.approved', 'bsc.review.override',
] as const;

export const CANONICAL_BSC_REPORT_PERMISSIONS = [
  'bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization', 'bsc.report.export',
  'bsc.minutes.create', 'bsc.minutes.view',
] as const;

export const CANONICAL_DEPARTMENT_BSC_PERMISSIONS = [
  'bsc.department.create', 'bsc.department.view', 'bsc.department.edit', 'bsc.department.delete.draft',
  'bsc.department.duplicate', 'bsc.department.plan.submit', 'bsc.department.plan.approve', 'bsc.department.plan.return',
  'bsc.department.evaluation.submit', 'bsc.department.evaluation.approve', 'bsc.department.evaluation.return',
  'bsc.department.reopen.request', 'bsc.department.reopen.review', 'bsc.department.version.view', 'bsc.department.report.export',
] as const;

const legacyCode = (...segments: string[]) => ['system', ...segments].join('.');
export const LEGACY_SYSTEM_PERMISSIONS = [
  legacyCode('audit', 'view'), legacyCode('bsc', 'config', 'manage'), legacyCode('organization', 'manage'),
  legacyCode('period', 'manage'), legacyCode('permission', 'manage'), legacyCode('role', 'manage'), legacyCode('user', 'manage'),
] as const;

const prisma = new PrismaClient();

const CANONICAL_ROLES = {
  EMPLOYEE: { name: 'Nhân viên', hierarchyLevel: 10 },
  MANAGER: { name: 'Quản lý', hierarchyLevel: 50 },
  DIRECTOR: { name: 'Giám đốc', hierarchyLevel: 80 },
  ADMIN: { name: 'Quản trị viên', hierarchyLevel: 100 },
} as const;

const ROLE_BSC_PERMISSIONS: Record<keyof typeof CANONICAL_ROLES, readonly string[]> = {
  EMPLOYEE: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal', 'bsc.report.export'],
  MANAGER: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.view.subordinate', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.reopen.subordinate', 'bsc.reset.approved', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.report.export',
    'bsc.department.create', 'bsc.department.view', 'bsc.department.edit', 'bsc.department.delete.draft', 'bsc.department.duplicate', 'bsc.department.plan.submit', 'bsc.department.evaluation.submit', 'bsc.department.reopen.request', 'bsc.department.version.view', 'bsc.department.report.export'],
  DIRECTOR: ['bsc.view.unit', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.subordinate', 'bsc.reset.approved', 'bsc.review.override', 'bsc.version.view', 'bsc.statistics.organization', 'bsc.report.export', 'bsc.minutes.create', 'bsc.minutes.view',
    'bsc.department.view', 'bsc.department.plan.approve', 'bsc.department.plan.return', 'bsc.department.evaluation.approve', 'bsc.department.evaluation.return', 'bsc.department.reopen.review', 'bsc.department.version.view', 'bsc.department.report.export'],
  ADMIN: [],
};

function moduleFor(code: string): string { return code.split('.')[0]; }

export async function seedPermissions(client: Prisma.TransactionClient): Promise<void> {
  const roles = new Map<string, { id: string }>();
  for (const [code, role] of Object.entries(CANONICAL_ROLES)) {
    const saved = await client.roles.upsert({
      where: { code },
      create: { code, name: role.name, hierarchy_level: role.hierarchyLevel, is_system: true, status: 'ACTIVE' },
      update: { name: role.name, hierarchy_level: role.hierarchyLevel, is_system: true },
    });
    roles.set(code, saved);
  }
  const admin = roles.get('ADMIN');
  if (!admin) throw new Error('Unable to seed required ADMIN role');

  const canonical = [] as Array<{ id: string }>;
  for (const code of CANONICAL_ADMIN_PERMISSIONS) {
    canonical.push(await client.permissions.upsert({ where: { code }, create: { code, name: code, module: moduleFor(code) }, update: {} }));
  }
  const bscPermissions = new Map<string, string>();
  for (const code of [...CANONICAL_BSC_DRAFT_PERMISSIONS, ...CANONICAL_BSC_WORKFLOW_PERMISSIONS, ...CANONICAL_BSC_REPORT_PERMISSIONS, ...CANONICAL_DEPARTMENT_BSC_PERMISSIONS]) {
    const permission = await client.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
    bscPermissions.set(code, permission.id);
  }
  for (const permission of canonical) {
    await client.role_permissions.upsert({ where: { role_id_permission_id: { role_id: admin.id, permission_id: permission.id } }, create: { role_id: admin.id, permission_id: permission.id }, update: {} });
  }
  for (const [roleCode, codes] of Object.entries(ROLE_BSC_PERMISSIONS)) {
    const role = roles.get(roleCode);
    if (!role) throw new Error(`Unable to seed required ${roleCode} role`);
    for (const code of codes) {
      const permissionId = bscPermissions.get(code);
      if (permissionId) await client.role_permissions.upsert({ where: { role_id_permission_id: { role_id: role.id, permission_id: permissionId } }, create: { role_id: role.id, permission_id: permissionId }, update: {} });
    }
  }
  const deniedAdminPermissionIds = [...CANONICAL_BSC_WORKFLOW_PERMISSIONS]
    .filter((code) => code.includes('.approve.') || code.includes('.return.'))
    .map((code) => bscPermissions.get(code))
    .filter((id): id is string => Boolean(id));
  await client.role_permissions.deleteMany({ where: { role_id: admin.id, permission_id: { in: deniedAdminPermissionIds } } });

  const legacy = await client.permissions.findMany({ where: { OR: [{ code: { startsWith: 'system.' } }, { code: { in: [...LEGACY_SYSTEM_PERMISSIONS] } }] }, select: { id: true } });
  for (const permission of legacy) {
    await client.role_permissions.deleteMany({ where: { permission_id: permission.id } });
  }
  for (const permission of legacy) {
    const remainingAssignments = await client.role_permissions.count({ where: { permission_id: permission.id } });
    if (remainingAssignments === 0) await client.permissions.delete({ where: { id: permission.id } });
  }
}

export async function seedEmployeeBscApprovalRoutes(client: Prisma.TransactionClient): Promise<void> {
  const routedDepartments = await client.departments.findMany({
    where: { name: { in: ['Marketing', 'Chăm sóc khách hàng'], mode: 'insensitive' } },
    select: { id: true },
  });
  for (const department of routedDepartments) {
    for (const stage of ['PLAN', 'EVALUATION'] as const) {
      await client.employee_bsc_approval_routes.upsert({
        where: { department_id_stage: { department_id: department.id, stage } },
        create: { department_id: department.id, stage, reviewer_type: 'DEPARTMENT_MANAGER' },
        update: { reviewer_type: 'DEPARTMENT_MANAGER', updated_at: new Date() },
      });
    }
  }
}

const BOOTSTRAP_KEYS = [
  'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_ADMIN_EMPLOYEE_CODE',
  'BOOTSTRAP_ADMIN_FULL_NAME', 'BOOTSTRAP_ADMIN_DEPARTMENT_CODE', 'BOOTSTRAP_ADMIN_DEPARTMENT_NAME',
  'BOOTSTRAP_ADMIN_POSITION_CODE', 'BOOTSTRAP_ADMIN_POSITION_NAME', 'BOOTSTRAP_ADMIN_POSITION_LEVEL',
] as const;

export async function ensureBootstrapAdmin(client: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<'created' | 'preserved'> {
  const activeAdmin = await client.users.findFirst({
    where: {
      status: 'ACTIVE', deleted_at: null,
      user_roles_user_roles_user_idTousers: { some: { roles: { code: 'ADMIN', status: 'ACTIVE' }, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] } },
    },
    select: { id: true },
  });
  if (activeAdmin) return 'preserved';

  const missing = BOOTSTRAP_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`No active ADMIN exists. Missing bootstrap environment variables: ${missing.join(', ')}`);
  const password = String(env.BOOTSTRAP_ADMIN_PASSWORD);
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');
  const positionCode = String(env.BOOTSTRAP_ADMIN_POSITION_CODE).trim().toUpperCase();
  if (positionCode === 'ADMIN') throw new Error('BOOTSTRAP_ADMIN_POSITION_CODE must be a professional position code, not the ADMIN system role');
  const positionLevel = Number(String(env.BOOTSTRAP_ADMIN_POSITION_LEVEL).trim());
  if (!Number.isInteger(positionLevel) || positionLevel < 1 || positionLevel > 999) throw new Error('BOOTSTRAP_ADMIN_POSITION_LEVEL must be an integer from 1 to 999');
  const passwordHash = await argon2.hash(password);
  const bootstrapUsername = normalizeUsername(String(env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE));
  if (!isValidUsername(bootstrapUsername)) throw new Error('BOOTSTRAP_ADMIN_EMPLOYEE_CODE must produce a 3-50 character username using only letters, numbers, dot, underscore or hyphen');

  await client.$transaction(async (tx) => {
    const role = await tx.roles.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const department = await tx.departments.upsert({
      where: { code: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_CODE) },
      create: { code: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_CODE), name: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_NAME), status: 'ACTIVE' },
      update: {},
    });
    const position = await tx.positions.upsert({
      where: { code: positionCode },
      create: { code: positionCode, name: String(env.BOOTSTRAP_ADMIN_POSITION_NAME).trim(), level: positionLevel, status: 'ACTIVE' },
      update: {},
    });
    const user = await tx.users.create({
      data: {
        employee_code: String(env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE), username: bootstrapUsername, full_name: String(env.BOOTSTRAP_ADMIN_FULL_NAME),
        email: String(env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase(), password_hash: passwordHash,
        department_id: department.id, position_id: position.id, status: 'ACTIVE',
      },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_type: 'GLOBAL' } });
    await tx.audit_logs.create({ data: { user_id: user.id, module: 'system', entity_type: 'users', entity_id: user.id, action: 'BOOTSTRAP_ADMIN_CREATED', new_data: { source: 'release-seed' } } });
  });
  return 'created';
}

export interface EmployeeBscTransferBackfillResult {
  mode: 'DRY_RUN' | 'APPLY';
  requestedEmployeeIds: string[];
  transferredEmployeeIds: string[];
  candidateBscCount: number;
  transferredBscCount: number;
}

class BscTransferDryRunRollback extends Error {
  constructor(readonly result: EmployeeBscTransferBackfillResult) {
    super('Rollback BSC transfer dry run');
  }
}

function transferBackfillEmployeeIds(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
}

export async function backfillTransferredEmployeeBsc(
  client: PrismaClient,
  rawEmployeeIds: string | undefined,
  mode: 'DRY_RUN' | 'APPLY' = 'APPLY',
  actorId?: string,
): Promise<EmployeeBscTransferBackfillResult> {
  const employeeIds = transferBackfillEmployeeIds(rawEmployeeIds);
  if (employeeIds.length === 0) {
    return { mode, requestedEmployeeIds: [], transferredEmployeeIds: [], candidateBscCount: 0, transferredBscCount: 0 };
  }
  const invalidId = employeeIds.find((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  if (invalidId) throw new Error(`BSC_TRANSFER_BACKFILL_USER_IDS contains an invalid UUID: ${invalidId}`);
  if (!actorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error('BSC_TRANSFER_BACKFILL_ACTOR_ID must be a valid operator UUID');
  }

  const reviewerResolver = new BscReviewerResolver();
  try {
    return await client.$transaction(async (tx) => {
      const users = await tx.users.findMany({
        where: { id: { in: employeeIds }, status: 'ACTIVE', deleted_at: null },
        select: { id: true, department_id: true, position_id: true, direct_manager_id: true },
        orderBy: { id: 'asc' },
      });
      const foundIds = new Set(users.map((user) => user.id));
      const missing = employeeIds.filter((id) => !foundIds.has(id));
      if (missing.length) throw new Error(`BSC transfer backfill users were not found or inactive: ${missing.join(', ')}`);
      const actor = await tx.users.findFirst({
        where: { id: actorId, status: 'ACTIVE', deleted_at: null },
        select: { id: true },
      });
      if (!actor) throw new Error('BSC transfer backfill operator was not found or inactive');

      const transferredEmployeeIds: string[] = [];
      let transferredBscCount = 0;
      for (const user of users) {
        const result = await transferOpenEmployeeBsc(tx, reviewerResolver, {
          employeeId: user.id,
          departmentId: user.department_id,
          positionId: user.position_id,
          directManagerId: user.direct_manager_id,
          actorId: actor.id,
          reason: 'Đồng bộ BSC kỳ mở sau khi nhân sự đã được điều chuyển',
          source: 'RELEASE_BACKFILL',
        });
        if (result.transferredBscIds.length) {
          transferredEmployeeIds.push(user.id);
          transferredBscCount += result.transferredBscIds.length;
        }
      }
      const result = {
        mode,
        requestedEmployeeIds: employeeIds,
        transferredEmployeeIds,
        candidateBscCount: transferredBscCount,
        transferredBscCount: mode === 'APPLY' ? transferredBscCount : 0,
      };
      if (mode === 'DRY_RUN') throw new BscTransferDryRunRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof BscTransferDryRunRollback) return error.result;
    throw error;
  }
}

export async function seedReleaseData(client: PrismaClient = prisma, env: NodeJS.ProcessEnv = process.env) {
  await client.$transaction(async (tx) => {
    await seedPermissions(tx);
    await seedEmployeeBscApprovalRoutes(tx);
  });
  const admin = await ensureBootstrapAdmin(client, env);
  const requestedMode = env.BSC_TRANSFER_BACKFILL_MODE?.trim().toUpperCase();
  if (requestedMode && requestedMode !== 'DRY_RUN' && requestedMode !== 'APPLY') {
    throw new Error('BSC_TRANSFER_BACKFILL_MODE must be DRY_RUN or APPLY');
  }
  const bscTransferBackfill = await backfillTransferredEmployeeBsc(
    client,
    env.BSC_TRANSFER_BACKFILL_USER_IDS,
    requestedMode === 'APPLY' ? 'APPLY' : 'DRY_RUN',
    env.BSC_TRANSFER_BACKFILL_ACTOR_ID?.trim(),
  );
  return { admin, bscTransferBackfill };
}

async function main() {
  const result = await seedReleaseData();
  console.log(JSON.stringify({ status: 'ok', bootstrapAdmin: result.admin, bscTransferBackfill: result.bscTransferBackfill }));
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : 'Release seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
