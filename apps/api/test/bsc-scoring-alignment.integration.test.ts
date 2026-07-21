import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCROUND_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscRound!Test#1';
const ids = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };
let httpAssertions = 0;

function safeDatabase() {
  try {
    return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test';
  } catch { return false; }
}

async function cleanup() {
  if (ids.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: ids.users } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (ids.users.length) {
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: ids.users } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: ids.users } }, { manager_id: { in: ids.users } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { assigned_by: { in: ids.users } }] } });
    await prisma.users.deleteMany({ where: { id: { in: ids.users } } });
  }
  if (ids.roles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: ids.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: ids.roles } } });
  }
  for (const id of ids.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

async function assertClean() {
  const counts = {
    users: await prisma.users.count({ where: { employee_code: { startsWith: marker } } }),
    roles: await prisma.roles.count({ where: { code: { startsWith: marker } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: marker } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: marker } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: marker } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: marker } } }),
  };
  assert.deepEqual(counts, { users: 0, roles: 0, departments: 0, positions: 0, cycles: 0, bscs: 0 });
}

test('Phase 3B.4 scoring alignment integration', {
  skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with exact bsc_organization_test',
}, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(database[0].current_database.toLowerCase(), 'bsc_organization_test');
  assert.notEqual(database[0].current_database.toLowerCase(), 'bsc_db');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEPT`, name: `${marker} Department` } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position`, level: 1 } });
    for (const code of Object.values(BSC_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) ids.permissions.push(permission.id);
    }
    const role = async (name: string, permissions: string[]) => {
      const result = await prisma.roles.create({ data: { code: `${marker}_${name}`, name, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      ids.roles.push(result.id);
      const rows = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: rows.map(({ id }) => ({ role_id: result.id, permission_id: id })) });
      return result;
    };
    const employeeRole = await role('EMPLOYEE', [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY]);
    const managerRole = await role('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY]);
    const noAccessRole = await role('NO_ACCESS', []);
    const hash = await argon2.hash(password);
    const user = async (name: string, roleId: string, scope: 'SELF' | 'DEPARTMENT', managerId?: string) => {
      const result = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: `${marker} ${name}`, email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: department.id, position_id: position.id, direct_manager_id: managerId } });
      ids.users.push(result.id);
      await prisma.user_roles.create({ data: { user_id: result.id, role_id: roleId, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? department.id : null } });
      return result;
    };
    const manager = await user('MANAGER', managerRole.id, 'DEPARTMENT');
    const employee = await user('EMPLOYEE', employeeRole.id, 'SELF', manager.id);
    const outsider = await user('OUTSIDER', employeeRole.id, 'SELF', manager.id);
    const noAccess = await user('NO_ACCESS', noAccessRole.id, 'SELF', manager.id);
    await prisma.manager_relationships.create({ data: {
      employee_id: employee.id,
      manager_id: manager.id,
      is_primary: true,
      start_date: new Date('2026-01-01'),
    } });
    let sequence = 0;
    const makeBsc = async (name: string, items: Array<{ target?: string | number | null; actual?: string | number | null; weight: string | number; method?: string }>, state: 'DRAFT' | 'EVALUATION' = 'EVALUATION') => {
      sequence += 1;
      const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C${sequence}`, name: `${marker} Cycle ${sequence}`, cycle_type: 'MONTH', year: 2098 + Math.floor((sequence - 1) / 12), month: ((sequence - 1) % 12) + 1, start_date: new Date('2098-01-01'), end_date: new Date('2099-12-31'), submission_deadline: new Date('2099-12-31T23:59:59Z'), status: 'OPEN', created_by: manager.id } });
      const bsc = await prisma.employee_bsc.create({ data: { bsc_code: `${marker}_${name}`, cycle_id: cycle.id, employee_id: employee.id, department_id: department.id, position_id: position.id, direct_manager_id: manager.id, created_by: employee.id, plan_status: state === 'DRAFT' ? 'DRAFT' : 'APPROVED', evaluation_status: state === 'DRAFT' ? 'NOT_STARTED' : 'DRAFT' } });
      const createdItems = [];
      for (const [index, item] of items.entries()) {
        createdItems.push(await prisma.employee_bsc_items.create({ data: { employee_bsc_id: bsc.id, kpi_code: `${marker.slice(0, 34)}_${sequence}_${index}`, kpi_name: `KPI ${index}`, target_value: item.target === undefined ? 100 : item.target, actual_value: item.actual ?? null, weight: item.weight, calculation_method: item.method ?? 'ACTUAL_DIV_TARGET', assigned_by: manager.id, sort_order: index } }));
      }
      return { bsc, items: createdItems };
    };

    const created = await createApp(); app = created.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { employee: await login(employee.username), outsider: await login(outsider.username), noAccess: await login(noAccess.username), manager: await login(manager.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const expectHttp = async (call: any, status: number) => { httpAssertions += 1; return call.expect(status); };

    await t.test('preview enforces auth/scope and returns explicit raw and rounded fields', async () => {
      const record = await makeBsc('ACCESS', [{ actual: '84.9', weight: 50 }, { target: 1, actual: 1, weight: 50 }]);
      await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`), 401);
      await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`).set(auth(tokens.noAccess)), 403);
      await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`).set(auth(tokens.outsider)), 403);
      const preview = await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`).set(auth(tokens.manager)), 200);
      const first = preview.body.items[0];
      assert.deepEqual({ rawAchievementPercentage: first.rawAchievementPercentage, roundedAchievementPercentage: first.roundedAchievementPercentage, rawWorkScore: first.rawWorkScore, roundedWorkScore: first.roundedWorkScore, weightedScore: first.weightedScore }, { rawAchievementPercentage: 84.9, roundedAchievementPercentage: 85, rawWorkScore: 84.9, roundedWorkScore: 80, weightedScore: 40 });
      assert.deepEqual(preview.body.items.slice(1).map((item: any) => [item.rawAchievementPercentage, item.roundedWorkScore, item.weightedScore]), [[100, 100, 50]]);
      assert.doesNotMatch(JSON.stringify(preview.body), /NaN|Infinity/);
    });

    await t.test('HTTP preview applies exact achievement and work-score HALF_UP boundaries', async () => {
      for (const [raw, achievement, work] of [['87.4', 87, 90], ['87.5', 88, 90], ['87.9', 88, 90], ['84', 84, 80], ['85', 85, 90], ['94', 94, 90], ['95', 95, 100], ['158', 158, 160]] as const) {
        const record = await makeBsc(`ROUND_${raw.replace('.', '_')}`, [{ actual: raw, weight: 100 }]);
        const response = await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`).set(auth(tokens.employee)), 200);
        assert.equal(response.body.items[0].rawAchievementPercentage, Number(raw));
        assert.equal(response.body.items[0].roundedAchievementPercentage, achievement);
        assert.equal(response.body.items[0].roundedWorkScore, work);
      }
    });

    await t.test('weighted totals are exact, incomplete previews stay provisional', async () => {
      const complete = await makeBsc('WEIGHTED', [{ actual: 90, weight: 20 }, { actual: 158, weight: 20 }, { actual: 80, weight: 15 }, { actual: 110, weight: 25 }, { actual: 100, weight: 20 }]);
      const preview = await expectHttp(request(server).get(`/employee-bsc/${complete.bsc.id}/scoring-preview`).set(auth(tokens.employee)), 200);
      assert.deepEqual(preview.body.items.map((item: any) => item.weightedScore), [18, 32, 12, 27.5, 20]);
      assert.equal(preview.body.totalWeightedScore, 109.5); assert.equal(preview.body.isComplete, true); assert.equal(preview.body.classification, 'A+');
      const incomplete = await makeBsc('INCOMPLETE', [{ actual: 80, weight: 80 }, { actual: null, weight: 20 }]);
      const partial = await expectHttp(request(server).get(`/employee-bsc/${incomplete.bsc.id}/scoring-preview`).set(auth(tokens.employee)), 200);
      assert.equal(partial.body.totalWeightedScore, 64); assert.equal(partial.body.scoredWeight, 80); assert.equal(partial.body.isComplete, false); assert.equal(partial.body.classification, null);
      const underweight = await makeBsc('UNDERWEIGHT', [{ actual: 80, weight: 80 }]);
      const underweightPreview = await expectHttp(request(server).get(`/employee-bsc/${underweight.bsc.id}/scoring-preview`).set(auth(tokens.employee)), 200);
      assert.equal(underweightPreview.body.totalWeight, 80); assert.equal(underweightPreview.body.scoredWeight, 80);
      assert.equal(underweightPreview.body.isComplete, false); assert.equal(underweightPreview.body.classification, null);
    });

    await t.test('PLAN never persists scores and EVALUATION approval recomputes latest transaction data', async () => {
      const record = await makeBsc('WORKFLOW', [{ actual: null, weight: 100 }], 'DRAFT');
      const submittedPlan = await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/plan/submit`).set(auth(tokens.employee)).send({ finalScore: 999 }), 400);
      assert.equal(submittedPlan.body.code, 'VALIDATION_ERROR');
      await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      const planApproved = await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/plan/approve`).set(auth(tokens.manager)).send({}), 200);
      assert.equal(planApproved.body.final_score, null); assert.equal(planApproved.body.final_grade, null);
      await expectHttp(request(server).patch(`/employee-bsc/${record.bsc.id}/items/${record.items[0].id}/actual`).set(auth(tokens.employee)).send({ actualValue: 84, employeeNote: 'TM KQTH' }), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({ score: 999 }), 400);
      await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 200);
      const planPending = await expectHttp(request(server).get(`/employee-bsc/pending-review?stage=PLAN&search=${marker}_WORKFLOW`).set(auth(tokens.manager)), 200);
      const evaluationPending = await expectHttp(request(server).get(`/employee-bsc/pending-review?stage=EVALUATION&search=${marker}_WORKFLOW`).set(auth(tokens.manager)), 200);
      assert.equal(planPending.body.total, 0); assert.deepEqual(evaluationPending.body.items.map((item: any) => item.id), [record.bsc.id]);
      await prisma.employee_bsc_items.update({ where: { id: record.items[0].id }, data: { actual_value: 95 } });
      const approved = await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/approve`).set(auth(tokens.manager)).send({}), 200);
      assert.equal(Number(approved.body.final_score), 100); assert.equal(approved.body.final_grade, 'A');
      const persisted = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.bsc.id } });
      assert.equal(Number(persisted.manager_total_score), 100); assert.equal(Number(persisted.final_score), 100); assert.equal(persisted.final_grade, 'A');
      const audit = await prisma.audit_logs.findMany({ where: { entity_id: record.bsc.id } });
      assert.ok(audit.some((row) => row.action === 'BSC_EVALUATION_APPROVED'));
      const histories = await prisma.bsc_status_histories.findMany({ where: { employee_bsc_id: record.bsc.id }, orderBy: { changed_at: 'asc' } });
      assert.deepEqual(histories.map((row) => [row.stage, row.action]), [
        ['PLAN', 'SUBMIT_PLAN'], ['PLAN', 'APPROVE_PLAN'], ['EVALUATION', 'SUBMIT_EVALUATION'], ['EVALUATION', 'APPROVE_EVALUATION'],
      ]);
      assert.doesNotMatch(JSON.stringify(audit), /password|authorization|cookie|access.?token|refresh.?token|database_url/i);
    });

    await t.test('approval persists the canonical Decimal total used for classification', async () => {
      const record = await makeBsc('PREC', [
        { actual: 90, weight: '99.95' },
        { actual: 80, weight: '0.05' },
      ]);
      await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 200);
      const approved = await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/approve`).set(auth(tokens.manager)).send({}), 200);
      assert.equal(approved.body.final_score, '89.995'); assert.equal(approved.body.final_grade, 'B');
      const persisted = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.bsc.id } });
      assert.equal(persisted.final_score?.toString(), '89.995'); assert.equal(persisted.manager_total_score?.toString(), '89.995');
      assert.equal(persisted.final_grade, 'B');
      const review = await prisma.bsc_reviews.findFirstOrThrow({ where: { employee_bsc_id: record.bsc.id, stage: 'EVALUATION' } });
      assert.equal(review.score_after?.toString(), '89.995');
    });

    await t.test('concurrent evaluation approve/return has exactly one winner', async () => {
      const record = await makeBsc('RACE', [{ actual: 100, weight: 100 }]);
      await expectHttp(request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 200);
      const decisions = await Promise.all([
        request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/approve`).set(auth(tokens.manager)).send({}),
        request(server).post(`/employee-bsc/${record.bsc.id}/evaluation/return`).set(auth(tokens.manager)).send({ reason: 'Race' }),
      ]);
      httpAssertions += 2;
      assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
      await expectHttp(request(server).get(`/employee-bsc/${record.bsc.id}/scoring-preview`).set(auth(tokens.manager)), 200);
      assert.equal(await prisma.bsc_reviews.count({ where: { employee_bsc_id: record.bsc.id, stage: 'EVALUATION' } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: record.bsc.id, action: { in: ['BSC_EVALUATION_APPROVED', 'BSC_EVALUATION_RETURNED'] } } }), 1);
      assert.ok(httpAssertions >= 25, `Expected at least 25 HTTP assertions, received ${httpAssertions}`);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await assertClean();
    await prisma.$disconnect();
  }
});
