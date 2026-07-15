const { integrationEnvironment, run } = require('./integration-runner');

const env = integrationEnvironment('Organization');
run('npx', ['prisma', 'migrate', 'deploy'], env);
if (process.argv.includes('--deploy-only')) process.exit(0);
run('node', ['-r', 'ts-node/register/transpile-only', 'test/prepare-organization-test.ts'], env);
run('npm', ['run', 'seed'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/organization.integration.test.ts'], env);
