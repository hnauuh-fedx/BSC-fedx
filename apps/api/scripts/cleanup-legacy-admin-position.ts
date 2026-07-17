import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const argument = (name: string) => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).trim();

async function main() {
  const legacyPositions = await prisma.positions.findMany({
    where: { code: { contains: 'ADMIN', mode: 'insensitive' } },
    select: {
      id: true, code: true, name: true, status: true,
      users: { select: { id: true, employee_code: true, full_name: true, email: true, status: true } },
    },
  });
  const report = legacyPositions.filter(position => position.code.trim().toUpperCase() === 'ADMIN').map(position => ({
    position: { id: position.id, code: position.code, name: position.name, status: position.status },
    referencedUsers: position.users,
    safeToDeactivate: position.users.length === 0 && position.status !== 'INACTIVE',
    alreadyInactive: position.status === 'INACTIVE',
  }));
  const deactivate = process.argv.includes('--deactivate');
  console.log(JSON.stringify({ mode: deactivate ? 'DEACTIVATE_IF_UNREFERENCED' : 'REPORT_ONLY', report }, null, 2));

  if (!deactivate) return;
  const actorUserId = argument('--actor-user-id');
  const reason = argument('--reason');
  if (!actorUserId || !reason) throw new Error('--deactivate requires --actor-user-id=<uuid> and --reason=<text>.');
  const actor = await prisma.users.findUnique({ where: { id: actorUserId }, select: { id: true } });
  if (!actor) throw new Error('Cleanup actor user does not exist.');
  for (const item of report) {
    if (!item.safeToDeactivate) continue;
    await prisma.$transaction(async transaction => {
      await transaction.positions.update({ where: { id: item.position.id }, data: { status: 'INACTIVE', updated_at: new Date() } });
      await transaction.audit_logs.create({ data: {
        user_id: actor.id, module: 'organization', entity_type: 'position', entity_id: item.position.id,
        action: 'LEGACY_ADMIN_POSITION_DEACTIVATED', old_data: item.position,
        new_data: { ...item.position, status: 'INACTIVE', reason, source: 'cleanup-legacy-admin-position' },
      } });
    });
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Legacy ADMIN position cleanup failed.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
