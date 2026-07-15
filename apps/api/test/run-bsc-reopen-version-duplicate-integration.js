const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC reopen/version/duplicate');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-reopen-version-duplicate.integration.test.ts'], env);
