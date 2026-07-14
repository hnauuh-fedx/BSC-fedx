import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.roles.upsert({
    where: { code: 'ADMIN' },
    create: { code: 'ADMIN', name: 'Quản trị viên', hierarchy_level: 100, is_system: true, status: 'ACTIVE' },
    update: {},
  });
}
void main().finally(() => prisma.$disconnect());
