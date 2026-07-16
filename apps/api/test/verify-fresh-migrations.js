const { randomBytes } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { createServer } = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
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

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Unable to allocate API smoke port');
  return port;
}

async function smokeBuiltApi(env) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) throw new Error(`API production build failed with code ${build.status}`);
  const port = await availablePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...env, API_PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-1000); });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Built API exited before readiness: ${stderr.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')}`);
      try {
        const [health, readiness] = await Promise.all([fetch(`http://127.0.0.1:${port}/health`), fetch(`http://127.0.0.1:${port}/health/ready`)]);
        if (health.ok && readiness.ok) {
          console.log(JSON.stringify({ builtApiStarted: true, health: health.status, readiness: readiness.status }));
          return;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Built API readiness smoke timed out');
  } finally {
    child.kill();
  }
}

async function main() {
  const env = { ...process.env, DATABASE_URL: freshUrl.toString(), TEST_DATABASE_URL: freshUrl.toString(), NODE_ENV: 'test' };
  // Generate before the first Prisma query because Windows locks the loaded engine DLL.
  const generated = spawnSync('npx', ['prisma', 'generate'], {
    cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (generated.status !== 0) throw new Error(`Prisma generate failed with code ${generated.status}`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${freshDatabase}"`);
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

    const seedEnv = {
      ...env,
      BOOTSTRAP_ADMIN_EMAIL: 'bootstrap-admin@fresh-migration.test',
      BOOTSTRAP_ADMIN_PASSWORD: `FreshOnly!${randomBytes(16).toString('hex')}`,
      BOOTSTRAP_ADMIN_EMPLOYEE_CODE: 'FRESH_ADMIN',
      BOOTSTRAP_ADMIN_FULL_NAME: 'Fresh Migration Admin',
      BOOTSTRAP_ADMIN_DEPARTMENT_CODE: 'FRESH_ROOT',
      BOOTSTRAP_ADMIN_DEPARTMENT_NAME: 'Fresh Root',
      BOOTSTRAP_ADMIN_POSITION_CODE: 'FRESH_SYS_ADMIN',
      BOOTSTRAP_ADMIN_POSITION_NAME: 'Fresh System Administrator',
    };
    const runSeed = () => spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'prisma/seed.ts'], {
      cwd: path.resolve(__dirname, '..'), env: seedEnv, stdio: 'inherit', shell: false,
    });
    const firstSeed = runSeed();
    if (firstSeed.status !== 0) throw new Error(`First release seed failed with code ${firstSeed.status}`);
    const firstAdmin = await fresh.users.findUniqueOrThrow({ where: { email: seedEnv.BOOTSTRAP_ADMIN_EMAIL }, select: { id: true, password_hash: true } });
    const firstCounts = { roles: await fresh.roles.count(), permissions: await fresh.permissions.count(), users: await fresh.users.count() };
    const secondSeed = runSeed();
    if (secondSeed.status !== 0) throw new Error(`Second release seed failed with code ${secondSeed.status}`);
    const secondAdmin = await fresh.users.findUniqueOrThrow({ where: { email: seedEnv.BOOTSTRAP_ADMIN_EMAIL }, select: { id: true, password_hash: true } });
    const secondCounts = { roles: await fresh.roles.count(), permissions: await fresh.permissions.count(), users: await fresh.users.count() };
    if (firstAdmin.id !== secondAdmin.id || firstAdmin.password_hash !== secondAdmin.password_hash || JSON.stringify(firstCounts) !== JSON.stringify(secondCounts)) {
      throw new Error('Release seed is not idempotent');
    }
    const legacyPermissions = await fresh.permissions.count({ where: { code: { startsWith: 'system.' } } });
    const adminApprovalPermissions = await fresh.role_permissions.count({ where: { roles: { code: 'ADMIN' }, permissions: { code: { contains: '.approve.' } } } });
    if (legacyPermissions !== 0 || adminApprovalPermissions !== 0) throw new Error('Release seed permission policy verification failed');
    console.log(JSON.stringify({ releaseSeedRuns: 2, idempotent: true, bootstrapPasswordPreserved: true, legacyPermissions, adminApprovalPermissions }));
    await smokeBuiltApi(env);
  } finally {
    await fresh.$disconnect();
  }

  const status = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (status.status !== 0) throw new Error(`Fresh migration status failed with code ${status.status}`);

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
