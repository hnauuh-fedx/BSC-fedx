const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC scoring');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-scoring.integration.test.ts'], env);
