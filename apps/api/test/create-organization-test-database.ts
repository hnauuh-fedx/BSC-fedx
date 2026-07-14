import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const existing = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'bsc_organization_test') AS exists`;
  if (!existing[0]?.exists) await prisma.$executeRawUnsafe('CREATE DATABASE "bsc_organization_test"');
  console.log(existing[0]?.exists ? 'Organization test database already exists.' : 'Organization test database created.');
}
void main().finally(() => prisma.$disconnect());
