const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('Department BSC');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/department-bsc.integration.test.ts'], env);
