import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [database] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (database.current_database.toLowerCase() !== 'bsc_organization_test') throw new Error(`Unsafe organization test database: ${database.current_database}`);
  await prisma.roles.upsert({
    where: { code: 'ADMIN' },
    create: { code: 'ADMIN', name: 'Quản trị viên', hierarchy_level: 100, is_system: true, status: 'ACTIVE' },
    update: {},
  });
  const employeeCode = process.env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE;
  if (!employeeCode) return;
  const bootstrap = await prisma.users.findUnique({ where: { employee_code: employeeCode }, select: { id: true } });
  if (!bootstrap) return;
  await prisma.$transaction([
    prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: bootstrap.id }, { entity_id: bootstrap.id }] } }),
    prisma.auth_refresh_tokens.deleteMany({ where: { user_id: bootstrap.id } }),
    prisma.user_roles.deleteMany({ where: { OR: [{ user_id: bootstrap.id }, { assigned_by: bootstrap.id }] } }),
    prisma.users.delete({ where: { id: bootstrap.id } }),
  ]);
}
void main().finally(() => prisma.$disconnect());
