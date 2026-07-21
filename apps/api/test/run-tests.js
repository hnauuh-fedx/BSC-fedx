const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { integrationEnvironment } = require('./integration-runner');

function collectTestFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = collectTestFiles(__dirname);
if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}
const testEnvironment = integrationEnvironment('Workspace test');
testEnvironment.RUN_LIVE_DB_TESTS = '1';
// The test server is called directly at /auth; the local web proxy path (/api/auth)
// must not leak in from a developer .env and break the cookie jar semantics.
testEnvironment.REFRESH_COOKIE_PATH = '/auth';

const result = spawnSync(
  process.execPath,
  ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', ...testFiles],
  {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: testEnvironment,
  },
);

process.exit(result.status ?? 1);
