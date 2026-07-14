const { spawnSync } = require('node:child_process');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '../../.env') });

function safeTestUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL must be a valid URL.'); }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
  if (!database || ['bsc_db', 'postgres', 'template0', 'template1'].includes(database) || !database.includes('test')) {
    throw new Error(`Unsafe integration database name: ${database || '(empty)'}`);
  }
  return { raw, database };
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let config;
try { config = safeTestUrl(); } catch (error) { console.error(error.message); process.exit(1); }
console.log(`Organization integration database: ${config.database}`);
const env = { ...process.env, DATABASE_URL: config.raw, TEST_DATABASE_URL: config.raw, NODE_ENV: 'test' };
run('npx', ['prisma', 'migrate', 'deploy'], env);
if (process.argv.includes('--deploy-only')) process.exit(0);
run('node', ['-r', 'ts-node/register/transpile-only', 'test/prepare-organization-test.ts'], env);
run('npm', ['run', 'seed'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/organization.integration.test.ts'], env);
