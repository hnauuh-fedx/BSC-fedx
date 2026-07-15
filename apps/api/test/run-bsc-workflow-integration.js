const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC workflow');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-workflow.integration.test.ts'], env);
