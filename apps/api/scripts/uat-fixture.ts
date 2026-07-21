import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase, assertFixturePrefix, databaseName } from './lib/database-safety';

const baseUrl = process.env.TEST_DATABASE_URL ?? '';
const prisma = new PrismaClient({ datasources: { db: { url: baseUrl } } });
const marker = (process.env.UAT_FIXTURE_PREFIX ?? `BSCUAT_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`).toUpperCase();
const short = (suffix: string) => `${marker}_${suffix}`.slice(0, 50);

const rolePermissions: Record<string, readonly string[]> = {
  EMPLOYEE: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal'],
  MANAGER: ['bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own', 'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own', 'bsc.view.subordinate', 'bsc.kpi.manage.subordinate', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.request', 'bsc.reopen.subordinate', 'bsc.version.view', 'bsc.duplicate.own', 'bsc.statistics.personal', 'bsc.statistics.unit', 'bsc.report.export'],
  DIRECTOR: ['bsc.view.unit', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate', 'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate', 'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.reopen.subordinate', 'bsc.version.view', 'bsc.statistics.organization', 'bsc.report.export'],
  ADMIN: ['user.view', 'user.create', 'user.update', 'user.lock', 'user.password.reset', 'department.view', 'department.manage', 'position.view', 'position.manage', 'role.view', 'role.manage', 'permission.view', 'permission.assign', 'bsc.period.view', 'bsc.period.manage', 'bsc.template.view', 'bsc.template.manage', 'audit.view'],
};

async function ensureCanonicalRoles() {
  const codes = Object.keys(rolePermissions);
  const existing = await prisma.roles.findMany({ where: { code: { in: codes } } });
  const inactive = existing.find((role) => role.status !== 'ACTIVE');
  if (inactive) throw new Error(`Canonical role ${inactive.code} is inactive; fixture will not modify base configuration.`);

  const hierarchy: Record<string, number> = { EMPLOYEE: 10, MANAGER: 50, DIRECTOR: 80, ADMIN: 100 };
  const roles: Record<string, Awaited<ReturnType<typeof prisma.roles.create>>> = Object.fromEntries(existing.map((role) => [role.code.toLowerCase(), role]));
  for (const code of codes) {
    if (roles[code.toLowerCase()]) continue;
    const role = await prisma.roles.create({ data: { code, name: code, hierarchy_level: hierarchy[code], description: marker, is_system: true } });
    roles[code.toLowerCase()] = role;
    for (const permissionCode of rolePermissions[code]) {
      const permission = await prisma.permissions.upsert({
        where: { code: permissionCode },
        create: { code: permissionCode, name: permissionCode, module: permissionCode.split('.')[0], description: marker },
        update: {},
      });
      await prisma.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    }
  }
  return roles;
}

async function cleanup(prefix = marker) {
  assertDisposableDatabase(baseUrl, databaseName(baseUrl), 'uat');
  assertFixturePrefix(prefix, 'uat');
  const users = await prisma.users.findMany({ where: { employee_code: { startsWith: prefix } }, select: { id: true } });
  const ids = users.map((row) => row.id);
  if (ids.length) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.employee_bsc.deleteMany({ where: { OR: [{ employee_id: { in: ids } }, { created_by: { in: ids } }] } });
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: ids } }, { manager_id: { in: ids } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: ids } }, { assigned_by: { in: ids } }] } });
    await prisma.users.updateMany({ where: { direct_manager_id: { in: ids } }, data: { direct_manager_id: null } });
    await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.departments.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: prefix } } });
  const fixtureRoles = await prisma.roles.findMany({ where: { description: prefix }, select: { id: true } });
  if (fixtureRoles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: fixtureRoles.map((role) => role.id) } } });
    await prisma.roles.deleteMany({ where: { id: { in: fixtureRoles.map((role) => role.id) }, description: prefix } });
  }
  const fixturePermissions = await prisma.permissions.findMany({ where: { description: prefix }, select: { id: true } });
  for (const permission of fixturePermissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: permission.id } }) === 0) {
      await prisma.permissions.delete({ where: { id: permission.id } });
    }
  }
  const remaining = {
    users: await prisma.users.count({ where: { employee_code: { startsWith: prefix } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: prefix } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: prefix } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: prefix } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: prefix } } }),
    roles: await prisma.roles.count({ where: { description: prefix } }),
    permissions: await prisma.permissions.count({ where: { description: prefix } }),
  };
  return { prefix, deletedUsers: ids.length, remaining, cleanupVerified: Object.values(remaining).every((count) => count === 0) };
}

async function seed() {
  assertDisposableDatabase(baseUrl, databaseName(baseUrl), 'uat');
  const password = process.env.UAT_PASSWORD;
  if (!password || password.length < 12) throw new Error('UAT_PASSWORD (12+ chars) is required at runtime and is never logged.');
  assertFixturePrefix(marker, 'uat');
  await cleanup(marker);
  const root = await prisma.departments.create({ data: { code: short('ROOT'), name: `${marker} Root` } });
  const team = await prisma.departments.create({ data: { code: short('TEAM'), name: `${marker} Team`, parent_id: root.id } });
  const outside = await prisma.departments.create({ data: { code: short('OUTSIDE'), name: `${marker} Outside` } });
  const position = await prisma.positions.create({ data: { code: short('POSITION'), name: `${marker} Position`, level: 1 } });
  const roles = await ensureCanonicalRoles();
  const hash = await argon2.hash(password);
  const user = async (suffix: string, roleId: string, departmentId: string, managerId?: string) => {
    const value = await prisma.users.create({ data: { employee_code: short(suffix), username: short(suffix).toLowerCase(), full_name: `${marker} ${suffix}`, email: `${short(suffix).toLowerCase()}@uat.example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
    await prisma.user_roles.create({ data: { user_id: value.id, role_id: roleId, scope_type: suffix === 'EMPLOYEE' ? 'SELF' : 'DEPARTMENT', scope_id: suffix === 'EMPLOYEE' ? null : departmentId } });
    if (managerId) await prisma.manager_relationships.create({ data: { employee_id: value.id, manager_id: managerId, start_date: new Date('2020-01-01'), is_primary: true } });
    return value;
  };
  const director = await user('DIRECTOR', roles.director.id, root.id);
  const manager = await user('MANAGER', roles.manager.id, team.id, director.id);
  const employee = await user('EMPLOYEE', roles.employee.id, team.id, manager.id);
  const admin = await user('ADMIN', roles.admin.id, root.id);
  const outsideUser = await user('OUTSIDE', roles.employee.id, outside.id);
  const states = [
    ['PLAN_DRAFT', 'DRAFT', 'NOT_STARTED'], ['PLAN_SUBMITTED', 'SUBMITTED', 'NOT_STARTED'], ['PLAN_RETURNED', 'RETURNED', 'NOT_STARTED'],
    ['EVAL_DRAFT', 'APPROVED', 'DRAFT'], ['EVAL_SUBMITTED', 'APPROVED', 'SUBMITTED'], ['EVAL_RETURNED', 'APPROVED', 'RETURNED'],
    ['EVAL_APPROVED', 'APPROVED', 'APPROVED'], ['PENDING_REOPEN', 'APPROVED', 'APPROVED'],
    ['PLAN_REOPENED', 'REOPENED', 'NOT_STARTED'], ['EVAL_REOPENED', 'APPROVED', 'REOPENED'],
  ] as const;
  for (const [index, [name, plan, evaluation]] of states.entries()) {
    const cycle = await prisma.bsc_cycles.create({ data: { code: short(`C${index}`), name: `${marker} ${name}`, cycle_type: 'MONTH', year: 2080 + index, month: 1, start_date: new Date(`${2080 + index}-01-01`), end_date: new Date(`${2080 + index}-01-31`), submission_deadline: new Date('2099-12-31'), status: index === 9 ? 'CLOSED' : 'OPEN', created_by: admin.id } });
    const legacyStatus = evaluation === 'APPROVED' ? 'APPROVED' : ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED'].includes(plan) ? plan : 'DRAFT';
    const record = await prisma.employee_bsc.create({ data: { bsc_code: short(`BSC_${index}`), cycle_id: cycle.id, employee_id: employee.id, department_id: team.id, position_id: position.id, direct_manager_id: manager.id, created_by: employee.id, plan_status: plan, evaluation_status: evaluation, status: legacyStatus } });
    await prisma.employee_bsc_items.create({ data: { employee_bsc_id: record.id, kpi_code: short(`KPI_${index}`), kpi_name: `UAT ${name}`, target_value: 100, actual_value: evaluation === 'NOT_STARTED' ? null : 90, weight: 100, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id } });
    let versionNumber = 0;
    if (plan === 'APPROVED' || name === 'PLAN_REOPENED') {
      versionNumber += 1; await prisma.bsc_versions.create({ data: { employee_bsc_id: record.id, version_number: versionNumber, stage: 'PLAN', version_type: 'PLAN_APPROVED', snapshot: { fixture: marker, state: name }, created_by: manager.id } });
    }
    if (evaluation === 'APPROVED' || name === 'EVAL_REOPENED') {
      versionNumber += 1; await prisma.bsc_versions.create({ data: { employee_bsc_id: record.id, version_number: versionNumber, stage: 'EVALUATION', version_type: 'EVALUATION_APPROVED', snapshot: { fixture: marker, state: name }, created_by: manager.id } });
    }
    if (name === 'PLAN_REOPENED' || name === 'EVAL_REOPENED') {
      versionNumber += 1; await prisma.bsc_versions.create({ data: { employee_bsc_id: record.id, version_number: versionNumber, stage: name === 'PLAN_REOPENED' ? 'PLAN' : 'EVALUATION', version_type: name === 'PLAN_REOPENED' ? 'BEFORE_PLAN_REOPEN' : 'BEFORE_EVALUATION_REOPEN', snapshot: { fixture: marker, state: name }, created_by: manager.id } });
    }
    if (name === 'PENDING_REOPEN') await prisma.bsc_unlock_requests.create({ data: { employee_bsc_id: record.id, stage: 'EVALUATION', requested_by: employee.id, reviewer_id: manager.id, request_reason: 'UAT pending reopen', status: 'PENDING' } });
  }
  console.log(JSON.stringify({ prefix: marker, database: databaseName(baseUrl), actors: { employee: employee.email, manager: manager.email, director: director.email, admin: admin.email, outside: outsideUser.email }, password: 'provided only through UAT_PASSWORD', bscStates: states.map(([name]) => name), cleanup: `UAT_FIXTURE_PREFIX=${marker} npm run uat:cleanup --workspace=apps/api` }, null, 2));
}

async function main() {
  const cleanupMode = process.argv.includes('--cleanup');
  try { cleanupMode ? console.log(JSON.stringify(await cleanup(), null, 2)) : await seed(); }
  catch (error) { if (!cleanupMode) await cleanup(marker).catch(() => undefined); throw error; }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) void main();
