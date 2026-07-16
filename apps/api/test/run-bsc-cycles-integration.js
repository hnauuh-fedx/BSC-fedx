const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('BSC cycles');
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/bsc-cycles.integration.test.ts'], env);
