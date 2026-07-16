import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

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
] as const;

export const CANONICAL_BSC_REPORT_PERMISSIONS = [
  'bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.statistics.organization', 'bsc.report.export',
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
  EMPLOYEE: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal'],
  MANAGER: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.view.subordinate', 'bsc.kpi.manage.subordinate', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.reopen.subordinate', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.report.export'],
  DIRECTOR: ['bsc.view.unit', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.subordinate', 'bsc.version.view', 'bsc.statistics.organization', 'bsc.report.export'],
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
  for (const code of [...CANONICAL_BSC_DRAFT_PERMISSIONS, ...CANONICAL_BSC_WORKFLOW_PERMISSIONS, ...CANONICAL_BSC_REPORT_PERMISSIONS]) {
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

const BOOTSTRAP_KEYS = [
  'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_ADMIN_EMPLOYEE_CODE',
  'BOOTSTRAP_ADMIN_FULL_NAME', 'BOOTSTRAP_ADMIN_DEPARTMENT_CODE', 'BOOTSTRAP_ADMIN_DEPARTMENT_NAME',
  'BOOTSTRAP_ADMIN_POSITION_CODE', 'BOOTSTRAP_ADMIN_POSITION_NAME',
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
  const passwordHash = await argon2.hash(password);

  await client.$transaction(async (tx) => {
    const role = await tx.roles.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const department = await tx.departments.upsert({
      where: { code: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_CODE) },
      create: { code: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_CODE), name: String(env.BOOTSTRAP_ADMIN_DEPARTMENT_NAME), status: 'ACTIVE' },
      update: {},
    });
    const position = await tx.positions.upsert({
      where: { code: String(env.BOOTSTRAP_ADMIN_POSITION_CODE) },
      create: { code: String(env.BOOTSTRAP_ADMIN_POSITION_CODE), name: String(env.BOOTSTRAP_ADMIN_POSITION_NAME), level: 100, status: 'ACTIVE' },
      update: {},
    });
    const user = await tx.users.create({
      data: {
        employee_code: String(env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE), full_name: String(env.BOOTSTRAP_ADMIN_FULL_NAME),
        email: String(env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase(), password_hash: passwordHash,
        department_id: department.id, position_id: position.id, status: 'ACTIVE',
      },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_type: 'GLOBAL' } });
    await tx.audit_logs.create({ data: { user_id: user.id, module: 'system', entity_type: 'users', entity_id: user.id, action: 'BOOTSTRAP_ADMIN_CREATED', new_data: { source: 'release-seed' } } });
  });
  return 'created';
}

export async function seedReleaseData(client: PrismaClient = prisma, env: NodeJS.ProcessEnv = process.env) {
  await client.$transaction((tx) => seedPermissions(tx));
  return { admin: await ensureBootstrapAdmin(client, env) };
}

async function main() {
  const result = await seedReleaseData();
  console.log(JSON.stringify({ status: 'ok', bootstrapAdmin: result.admin }));
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : 'Release seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
