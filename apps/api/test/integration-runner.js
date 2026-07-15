const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const apiDirectory = path.resolve(__dirname, '..');
const allowedDatabases = new Set(['bsc_organization_test']);

function loadSafeTestDatabase() {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.test.local'), override: false });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL must be a valid URL.'); }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
  if (!allowedDatabases.has(database)) throw new Error(`Unsafe integration database name: ${database || '(empty)'}`);
  return { raw, database };
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: apiDirectory, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function integrationEnvironment(label) {
  let config;
  try { config = loadSafeTestDatabase(); } catch (error) { console.error(error.message); process.exit(1); }
  console.log(`${label} integration database: ${config.database}`);
  return { ...process.env, DATABASE_URL: config.raw, TEST_DATABASE_URL: config.raw, NODE_ENV: 'test' };
}

module.exports = { integrationEnvironment, run };
