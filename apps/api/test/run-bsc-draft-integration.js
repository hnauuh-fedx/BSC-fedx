const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC draft');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-draft.integration.test.ts'], env);
