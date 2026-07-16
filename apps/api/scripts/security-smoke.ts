import path from 'node:path';
import { spawnSync } from 'node:child_process';

const api = path.resolve(__dirname, '..');
const files = [
  'test/auth.test.ts', 'test/rbac.test.ts', 'test/bsc-draft.test.ts', 'test/bsc-workflow.test.ts',
  'test/organization.integration.test.ts', 'test/bsc-draft.integration.test.ts',
  'test/bsc-reopen-version-duplicate.integration.test.ts',
];
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for security smoke.');
const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', ...files], {
  cwd: api, env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, RUN_LIVE_DB_TESTS: '1' }, stdio: 'inherit',
});
process.exit(result.status ?? 1);
