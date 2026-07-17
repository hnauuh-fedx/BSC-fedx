const { integrationEnvironment, run } = require('./integration-runner');

const baseEnv = integrationEnvironment('Organization');
const env = {
  ...baseEnv,
  BOOTSTRAP_ADMIN_EMAIL: baseEnv.BOOTSTRAP_ADMIN_EMAIL ?? 'organization-bootstrap-admin@example.test',
  BOOTSTRAP_ADMIN_PASSWORD: baseEnv.BOOTSTRAP_ADMIN_PASSWORD ?? 'OrganizationBootstrap!Test#1',
  BOOTSTRAP_ADMIN_EMPLOYEE_CODE: baseEnv.BOOTSTRAP_ADMIN_EMPLOYEE_CODE ?? 'ORG_BOOTSTRAP_ADMIN',
  BOOTSTRAP_ADMIN_FULL_NAME: baseEnv.BOOTSTRAP_ADMIN_FULL_NAME ?? 'Quản trị viên kiểm thử',
  BOOTSTRAP_ADMIN_DEPARTMENT_CODE: baseEnv.BOOTSTRAP_ADMIN_DEPARTMENT_CODE ?? 'ORG_TEST_ROOT',
  BOOTSTRAP_ADMIN_DEPARTMENT_NAME: baseEnv.BOOTSTRAP_ADMIN_DEPARTMENT_NAME ?? 'Đơn vị kiểm thử',
  BOOTSTRAP_ADMIN_POSITION_CODE: baseEnv.BOOTSTRAP_ADMIN_POSITION_CODE ?? 'SYSTEM_SPECIALIST',
  BOOTSTRAP_ADMIN_POSITION_NAME: baseEnv.BOOTSTRAP_ADMIN_POSITION_NAME ?? 'Chuyên viên hệ thống',
  BOOTSTRAP_ADMIN_POSITION_LEVEL: baseEnv.BOOTSTRAP_ADMIN_POSITION_LEVEL ?? '10',
};
run('npx', ['prisma', 'migrate', 'deploy'], env);
if (process.argv.includes('--deploy-only')) process.exit(0);
run('npm', ['run', 'seed'], env);
run('node', ['-r', 'ts-node/register/transpile-only', 'test/prepare-organization-test.ts'], env);
run('node', ['-r', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', 'test/organization.integration.test.ts'], env);
