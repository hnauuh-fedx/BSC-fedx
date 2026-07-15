import { PrismaClient, Prisma } from '@prisma/client';

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
  'bsc.submit.own', 'bsc.approve.subordinate', 'bsc.return.subordinate',
] as const;

const legacyCode = (...segments: string[]) => ['system', ...segments].join('.');
export const LEGACY_SYSTEM_PERMISSIONS = [
  legacyCode('audit', 'view'), legacyCode('bsc', 'config', 'manage'), legacyCode('organization', 'manage'),
  legacyCode('period', 'manage'), legacyCode('permission', 'manage'), legacyCode('role', 'manage'), legacyCode('user', 'manage'),
] as const;

const prisma = new PrismaClient();

function moduleFor(code: string): string { return code.split('.')[0]; }

export async function seedPermissions(client: Prisma.TransactionClient): Promise<void> {
  const admin = await client.roles.findUnique({ where: { code: 'ADMIN' } });
  if (!admin) throw new Error('Missing required role: ADMIN');

  const canonical = [] as Array<{ id: string }>;
  for (const code of CANONICAL_ADMIN_PERMISSIONS) {
    canonical.push(await client.permissions.upsert({ where: { code }, create: { code, name: code, module: moduleFor(code) }, update: {} }));
  }
  const bscPermissions = new Map<string, string>();
  for (const code of [...CANONICAL_BSC_DRAFT_PERMISSIONS, ...CANONICAL_BSC_WORKFLOW_PERMISSIONS]) {
    const permission = await client.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
    bscPermissions.set(code, permission.id);
  }
  for (const permission of canonical) {
    await client.role_permissions.upsert({ where: { role_id_permission_id: { role_id: admin.id, permission_id: permission.id } }, create: { role_id: admin.id, permission_id: permission.id }, update: {} });
  }
  const roleMappings: Record<string, readonly string[]> = {
    EMPLOYEE: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.submit.own'],
    MANAGER: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.submit.own', 'bsc.view.subordinate', 'bsc.kpi.manage.subordinate', 'bsc.approve.subordinate', 'bsc.return.subordinate'],
    DIRECTOR: ['bsc.view.unit', 'bsc.approve.subordinate', 'bsc.return.subordinate'],
  };
  for (const [roleCode, codes] of Object.entries(roleMappings)) {
    const role = await client.roles.findUnique({ where: { code: roleCode } });
    if (!role) continue;
    for (const code of codes) {
      const permissionId = bscPermissions.get(code);
      if (permissionId) await client.role_permissions.upsert({ where: { role_id_permission_id: { role_id: role.id, permission_id: permissionId } }, create: { role_id: role.id, permission_id: permissionId }, update: {} });
    }
  }

  const legacy = await client.permissions.findMany({ where: { code: { in: [...LEGACY_SYSTEM_PERMISSIONS] } }, select: { id: true } });
  for (const permission of legacy) {
    await client.role_permissions.deleteMany({ where: { role_id: admin.id, permission_id: permission.id } });
  }
  for (const permission of legacy) {
    const remainingAssignments = await client.role_permissions.count({ where: { permission_id: permission.id } });
    if (remainingAssignments === 0) await client.permissions.delete({ where: { id: permission.id } });
  }
}

async function main() { await prisma.$transaction((client) => seedPermissions(client)); }

if (require.main === module) main().finally(() => prisma.$disconnect());
