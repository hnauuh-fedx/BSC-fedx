const { randomBytes } = require('node:crypto');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test.local'), override: false });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });

const source = process.env.TEST_DATABASE_URL;
if (!source) throw new Error('TEST_DATABASE_URL is required.');
const sourceUrl = new URL(source);
const sourceDatabase = decodeURIComponent(sourceUrl.pathname.replace(/^\//, '')).toLowerCase();
if (sourceDatabase !== 'bsc_organization_test') throw new Error(`Unsafe source database: ${sourceDatabase || '(empty)'}`);

const freshDatabase = `bsc_organization_test_fresh_${randomBytes(4).toString('hex')}`;
if (!/^bsc_organization_test_fresh_[a-f0-9]{8}$/.test(freshDatabase)) throw new Error('Unsafe fresh database name.');
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const freshUrl = new URL(sourceUrl);
freshUrl.pathname = `/${freshDatabase}`;
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });

async function main() {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${freshDatabase}"`);
  const env = { ...process.env, DATABASE_URL: freshUrl.toString(), TEST_DATABASE_URL: freshUrl.toString(), NODE_ENV: 'test' };
  const deployed = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (deployed.status !== 0) throw new Error(`Fresh migration deploy failed with code ${deployed.status}`);

  const fresh = new PrismaClient({ datasources: { db: { url: freshUrl.toString() } } });
  try {
    const [applied] = await fresh.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const [failed] = await fresh.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    const expected = readdirSync(path.resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
    console.log(JSON.stringify({ database: freshDatabase, expectedMigrations: expected, appliedMigrations: applied.count, failedMigrations: failed.count, status: applied.count === expected && failed.count === 0 ? 'COMPLETE' : 'INCOMPLETE' }, null, 2));
    if (applied.count !== expected || failed.count !== 0) throw new Error('Fresh migration verification incomplete.');
  } finally {
    await fresh.$disconnect();
  }

  const drift = spawnSync('npx', [
    'prisma', 'migrate', 'diff',
    '--from-migrations', 'prisma/migrations',
    '--to-schema-datamodel', 'prisma/schema.prisma',
    '--shadow-database-url', freshUrl.toString(),
    '--exit-code',
  ], {
    cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (drift.status !== 0) throw new Error(`Fresh migration schema drift detected (code ${drift.status})`);
  console.log('Schema drift: NONE');
}

main().finally(async () => {
  await admin.$queryRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${freshDatabase}' AND pid <> pg_backend_pid()`);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${freshDatabase}"`);
  await admin.$disconnect();
});
