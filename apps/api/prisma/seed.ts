import { PrismaClient, Prisma } from '@prisma/client';

export const CANONICAL_ADMIN_PERMISSIONS = [
  'user.view', 'user.create', 'user.update', 'user.lock', 'user.password.reset',
  'department.view', 'department.manage', 'position.view', 'position.manage',
  'role.view', 'role.manage', 'permission.view', 'permission.assign',
  'bsc.period.view', 'bsc.period.manage', 'bsc.template.view', 'bsc.template.manage', 'audit.view',
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
  for (const permission of canonical) {
    await client.role_permissions.upsert({ where: { role_id_permission_id: { role_id: admin.id, permission_id: permission.id } }, create: { role_id: admin.id, permission_id: permission.id }, update: {} });
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
