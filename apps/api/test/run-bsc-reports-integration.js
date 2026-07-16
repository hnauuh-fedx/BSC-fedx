const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC reports');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-reports.integration.test.ts'], env);
