import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCWF_${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
const password = 'BscWorkflow!Test#1';
const tracked = {
  users: [] as string[], roles: [] as string[], permissions: [] as string[],
  departments: [] as string[], positions: [] as string[], cycles: [] as string[], bscs: [] as string[],
};

function safeDatabase(): boolean {
  try {
    const raw = process.env.TEST_DATABASE_URL;
    return Boolean(raw && decodeURIComponent(new URL(raw).pathname.replace(/^\//, '')).toLowerCase() === 'bsc_organization_test');
  } catch { return false; }
}

async function cleanup() {
  if (tracked.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: tracked.users } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (tracked.users.length) {
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: tracked.users } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: tracked.users } }, { manager_id: { in: tracked.users } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: tracked.users } }, { assigned_by: { in: tracked.users } }] } });
    await prisma.users.deleteMany({ where: { id: { in: tracked.users } } });
  }
  if (tracked.roles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: tracked.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: tracked.roles } } });
  }
  for (const id of tracked.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

async function assertFixtureClean() {
  const counts = {
    users: await prisma.users.count({ where: { employee_code: { startsWith: marker } } }),
    roles: await prisma.roles.count({ where: { code: { startsWith: marker } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: marker } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: marker } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: marker } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: marker } } }),
    audits: await prisma.audit_logs.count({ where: { user_id: { in: tracked.users } } }),
  };
  assert.deepEqual(counts, { users: 0, roles: 0, departments: 0, positions: 0, cycles: 0, bscs: 0, audits: 0 });
}

test('Phase 3B.3 BSC workflow integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with a safe test database' }, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(database[0].current_database.toLowerCase(), 'bsc_organization_test');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const departmentA = await prisma.departments.create({ data: { code: `${marker}_DEPT_A`, name: `${marker} Department A` } });
    const departmentB = await prisma.departments.create({ data: { code: `${marker}_DEPT_B`, name: `${marker} Department B` } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POSITION`, name: `${marker} Position`, level: 1 } });
    tracked.departments.push(departmentA.id, departmentB.id); tracked.positions.push(position.id);

    for (const code of Object.values(BSC_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) tracked.permissions.push(permission.id);
    }
    const createRole = async (suffix: string, permissions: string[]) => {
      const role = await prisma.roles.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      tracked.roles.push(role.id);
      const records = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: records.map(({ id }) => ({ role_id: role.id, permission_id: id })) });
      return role;
    };
    const employeeRole = await createRole('EMPLOYEE', [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.DELETE_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_OWN]);
    const managerRole = await createRole('MANAGER', [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.DELETE_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_OWN, BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.APPROVE_SUBORDINATE, BSC_PERMISSIONS.RETURN_SUBORDINATE]);
    const viewRole = await createRole('VIEW_ONLY', [BSC_PERMISSIONS.VIEW_SUBORDINATE]);
    const adminRole = await createRole('ADMIN_VIEW', [BSC_PERMISSIONS.VIEW_UNIT]);
    let directorRole = await prisma.roles.findUnique({ where: { code: 'DIRECTOR' } });
    if (!directorRole) {
      directorRole = await prisma.roles.create({ data: { code: 'DIRECTOR', name: 'Director', hierarchy_level: 2, is_system: true, status: 'ACTIVE' } });
      tracked.roles.push(directorRole.id);
      const directorPermissions = await prisma.permissions.findMany({ where: { code: { in: [BSC_PERMISSIONS.VIEW_UNIT, BSC_PERMISSIONS.APPROVE_SUBORDINATE, BSC_PERMISSIONS.RETURN_SUBORDINATE] } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: directorPermissions.map(({ id }) => ({ role_id: directorRole!.id, permission_id: id })) });
    }
    const hash = await argon2.hash(password);
    const createUser = async (suffix: string, departmentId: string, roleId: string, scopeType: 'GLOBAL'|'DEPARTMENT'|'SELF', scopeId: string | null, managerId?: string, status = 'ACTIVE') => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${suffix}`, full_name: `${marker} ${suffix}`, email: `${marker.toLowerCase()}_${suffix.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId, status } });
      tracked.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scopeType, scope_id: scopeId } });
      return user;
    };
    const admin = await createUser('ADMIN', departmentA.id, adminRole.id, 'GLOBAL', null);
    const director = await createUser('DIRECTOR', departmentA.id, directorRole.id, 'DEPARTMENT', departmentA.id, admin.id);
    const manager = await createUser('MANAGER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, admin.id);
    const managerOwner = await createUser('MANAGER_OWNER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, director.id);
    const otherManager = await createUser('OTHER_MANAGER', departmentB.id, managerRole.id, 'DEPARTMENT', departmentB.id, admin.id);
    const viewOnly = await createUser('VIEW_ONLY', departmentA.id, viewRole.id, 'DEPARTMENT', departmentA.id, admin.id);
    const inactiveManager = await createUser('INACTIVE_MANAGER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, admin.id, 'INACTIVE');
    const employee = await createUser('EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
    const employee2 = await createUser('EMPLOYEE_2', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
    const otherEmployee = await createUser('OTHER_EMPLOYEE', departmentB.id, employeeRole.id, 'SELF', null, otherManager.id);

    let cycleCounter = 0;
    const createCycle = async (status = 'OPEN') => {
      cycleCounter += 1;
      const cycle = await prisma.bsc_cycles.create({ data: {
        code: `${marker}_CYCLE_${cycleCounter}`, name: `${marker} Cycle ${cycleCounter}`, cycle_type: 'MONTH',
        year: 2099, month: ((cycleCounter - 1) % 12) + 1, start_date: new Date('2099-01-01'), end_date: new Date('2099-12-31'),
        submission_deadline: new Date('2099-12-31T23:59:59Z'), status, created_by: admin.id,
      } });
      tracked.cycles.push(cycle.id);
      return cycle;
    };
    const createBsc = async (suffix: string, options: { ownerId?: string; managerId?: string; status?: string; weights?: number[]; actuals?: Array<number|null>; methods?: string[]; cycleStatus?: string } = {}) => {
      const ownerId = options.ownerId ?? employee.id;
      const reviewerId = options.managerId ?? manager.id;
      const owner = ownerId === employee2.id ? employee2 : ownerId === otherEmployee.id ? otherEmployee : employee;
      const cycle = await createCycle(options.cycleStatus ?? 'OPEN');
      const bsc = await prisma.employee_bsc.create({ data: {
        bsc_code: `${marker}_${suffix}`, cycle_id: cycle.id, employee_id: ownerId, department_id: owner.department_id,
        position_id: position.id, direct_manager_id: reviewerId, status: options.status ?? 'DRAFT', created_by: ownerId,
      } });
      tracked.bscs.push(bsc.id);
      const weights = options.weights ?? [100];
      const actuals = options.actuals ?? weights.map(() => 100);
      const methods = options.methods ?? weights.map(() => 'ACTUAL_DIV_TARGET');
      for (let index = 0; index < weights.length; index += 1) {
        await prisma.employee_bsc_items.create({ data: {
          employee_bsc_id: bsc.id, kpi_code: `${marker}_${suffix}_${index}`, kpi_name: `KPI ${index + 1}`,
          target_value: 100, actual_value: actuals[index], weight: weights[index], calculation_method: methods[index],
          assigned_by: reviewerId, sort_order: index,
        } });
      }
      return bsc;
    };

    const createdApp = await createApp(); app = createdApp.app; await app.init(); const server = app.getHttpServer();
    const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    const tokens = { employee: await login(employee.email), employee2: await login(employee2.email), otherEmployee: await login(otherEmployee.email), manager: await login(manager.email), managerOwner: await login(managerOwner.email), director: await login(director.email), otherManager: await login(otherManager.email), viewOnly: await login(viewOnly.email), admin: await login(admin.email) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('owner submits only a complete BSC and the transition is atomic and locked', async () => {
      const complete = await createBsc('SUBMIT_COMPLETE');
      await request(server).post(`/employee-bsc/${complete.id}/submit`).expect(401);
      await request(server).post(`/employee-bsc/${complete.id}/submit`).set(auth(tokens.employee2)).expect(403);
      await request(server).post(`/employee-bsc/${complete.id}/submit`).set(auth(tokens.manager)).expect(403);
      const submitted = await request(server).post(`/employee-bsc/${complete.id}/submit`).set(auth(tokens.employee)).set('User-Agent', 'BSC-Workflow-Integration').send({}).expect(200);
      assert.equal(submitted.body.status, 'SUBMITTED');
      assert.ok(submitted.body.submitted_at);
      assert.ok(submitted.body.locked_at);
      const [history, audit, step] = await Promise.all([
        prisma.bsc_status_histories.findMany({ where: { employee_bsc_id: complete.id } }),
        prisma.audit_logs.findMany({ where: { entity_id: complete.id, action: 'BSC_SUBMITTED' } }),
        prisma.bsc_approval_steps.findMany({ where: { employee_bsc_id: complete.id } }),
      ]);
      assert.equal(history.length, 1); assert.deepEqual([history[0].from_status, history[0].to_status, history[0].action], ['DRAFT', 'SUBMITTED', 'SUBMIT']);
      assert.equal(history[0].user_agent, 'BSC-Workflow-Integration');
      assert.equal(audit.length, 1); assert.equal(step.length, 1); assert.equal(step[0].approver_id, manager.id); assert.equal(step[0].status, 'PENDING');
      assert.doesNotMatch(JSON.stringify(audit), /authorization|access.?token|refresh.?token|password|database_url/i);

      await request(server).patch(`/employee-bsc/${complete.id}`).set(auth(tokens.employee)).send({ employeeComment: 'blocked' }).expect(403);
      const item = await prisma.employee_bsc_items.findFirstOrThrow({ where: { employee_bsc_id: complete.id } });
      await request(server).patch(`/employee-bsc/${complete.id}/items/${item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 90 }).expect(403);
      await request(server).patch(`/employee-bsc/${complete.id}/items/${item.id}`).set(auth(tokens.manager)).send({ weight: 90 }).expect(403);
      await request(server).post(`/employee-bsc/${complete.id}/items`).set(auth(tokens.manager)).send({ kpiCode: 'LOCKED', kpiName: 'Locked', targetValue: 1, weight: 1, calculationMethod: 'ACTUAL_DIV_TARGET' }).expect(403);
      await request(server).delete(`/employee-bsc/${complete.id}/items/${item.id}`).set(auth(tokens.manager)).expect(403);
      await request(server).delete(`/employee-bsc/${complete.id}`).set(auth(tokens.employee)).expect(403);

      const invalidCases = [
        [await createBsc('NO_KPI', { weights: [] }), 'BSC_SUBMIT_INCOMPLETE'],
        [await createBsc('LOW_WEIGHT', { weights: [99] }), 'BSC_TOTAL_WEIGHT_NOT_100'],
        [await createBsc('HIGH_WEIGHT', { weights: [60, 41] }), 'BSC_TOTAL_WEIGHT_NOT_100'],
        [await createBsc('MISSING_ACTUAL', { actuals: [null] }), 'BSC_KPI_ACTUAL_REQUIRED'],
        [await createBsc('UNSCORABLE', { methods: ['THRESHOLD'] }), 'BSC_KPI_NOT_SCORABLE'],
        [await createBsc('NO_REVIEWER', { managerId: inactiveManager.id }), 'BSC_APPROVER_REQUIRED'],
      ] as const;
      for (const [bsc, code] of invalidCases) {
        const response = await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee)).send({}).expect(400);
        assert.equal(response.body.code, code);
        assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: bsc.id } }), 0);
      }
      const massAssignment = await request(server).post(`/employee-bsc/${invalidCases[1][0].id}/submit`).set(auth(tokens.employee)).send({ score: 999, isComplete: true }).expect(400);
      assert.equal(massAssignment.body.code, 'VALIDATION_ERROR');
    });

    await t.test('two concurrent submits produce exactly one successful transition', async () => {
      const bsc = await createBsc('CONCURRENT_SUBMIT', { ownerId: employee2.id });
      const responses = await Promise.all([
        request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee2)).send({}),
        request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee2)).send({}),
      ]);
      assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
      assert.ok(['BSC_WORKFLOW_CONFLICT', 'BSC_INVALID_TRANSITION'].includes(responses.find(({ status }) => status === 409)?.body.code));
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: bsc.id, from_status: 'DRAFT', to_status: 'SUBMITTED' } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: bsc.id, action: 'BSC_SUBMITTED' } }), 1);
      assert.equal(await prisma.bsc_approval_steps.count({ where: { employee_bsc_id: bsc.id } }), 1);
    });

    await t.test('only the direct manager approves a submitted BSC and duplicate approval is rejected', async () => {
      const bsc = await createBsc('APPROVE');
      await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).expect(401);
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.employee)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.otherManager)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.viewOnly)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.admin)).send({}).expect(403);

      const approved = await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.manager)).set('User-Agent', 'BSC-Approve').send({}).expect(200);
      assert.equal(approved.body.status, 'APPROVED');
      assert.equal(approved.body.approved_by, manager.id);
      assert.ok(approved.body.approved_at); assert.ok(approved.body.locked_at);
      assert.equal(Number(approved.body.final_score), 100); assert.equal(approved.body.final_grade, 'A');
      const [history, audit, reviews, step] = await Promise.all([
        prisma.bsc_status_histories.findMany({ where: { employee_bsc_id: bsc.id }, orderBy: { changed_at: 'asc' } }),
        prisma.audit_logs.findMany({ where: { entity_id: bsc.id, action: 'BSC_APPROVED' } }),
        prisma.bsc_reviews.findMany({ where: { employee_bsc_id: bsc.id, action: 'APPROVE' } }),
        prisma.bsc_approval_steps.findUniqueOrThrow({ where: { employee_bsc_id_step_order: { employee_bsc_id: bsc.id, step_order: 1 } } }),
      ]);
      assert.deepEqual(history.map(({ from_status, to_status }) => [from_status, to_status]), [['DRAFT', 'SUBMITTED'], ['SUBMITTED', 'APPROVED']]);
      assert.equal(history[1].user_agent, 'BSC-Approve'); assert.equal(audit.length, 1); assert.equal(reviews.length, 1); assert.equal(step.status, 'APPROVED');
      const duplicate = await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.manager)).send({}).expect(409);
      assert.equal(duplicate.body.code, 'BSC_INVALID_TRANSITION');
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: bsc.id, to_status: 'APPROVED' } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: bsc.id, action: 'BSC_APPROVED' } }), 1);
      const preview = await request(server).get(`/employee-bsc/${bsc.id}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.status, 'APPROVED'); assert.equal(preview.body.totalWeightedScore, 100); assert.equal(preview.body.classification, 'A');

      const draft = await createBsc('APPROVE_DRAFT');
      const invalidState = await request(server).post(`/employee-bsc/${draft.id}/approve`).set(auth(tokens.manager)).send({}).expect(409);
      assert.equal(invalidState.body.code, 'BSC_INVALID_TRANSITION');
    });

    await t.test('a manager submits a personal BSC to the direct DIRECTOR reviewer', async () => {
      const bsc = await createBsc('MANAGER_TO_DIRECTOR', { ownerId: managerOwner.id, managerId: director.id });
      await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.managerOwner)).send({}).expect(200);
      const step = await prisma.bsc_approval_steps.findUniqueOrThrow({ where: { employee_bsc_id_step_order: { employee_bsc_id: bsc.id, step_order: 1 } } });
      assert.equal(step.approver_id, director.id); assert.equal(step.approver_role, 'DIRECTOR');
      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.director)).send({}).expect(200);
      const review = await prisma.bsc_reviews.findFirstOrThrow({ where: { employee_bsc_id: bsc.id, reviewer_id: director.id } });
      assert.equal(review.reviewer_role, 'DIRECTOR'); assert.equal(review.action, 'APPROVE');
    });

    await t.test('return requires a reason, unlocks editing and preserves the complete resubmit history', async () => {
      const bsc = await createBsc('RETURN');
      await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee)).send({}).expect(200);
      for (const reason of ['', '   ']) {
        const invalid = await request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.manager)).send({ reason }).expect(400);
        assert.ok(['VALIDATION_ERROR', 'BSC_RETURN_REASON_REQUIRED'].includes(invalid.body.code));
      }
      await request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.employee)).send({ reason: 'Owner cannot return' }).expect(403);
      await request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.otherManager)).send({ reason: 'Outside scope' }).expect(403);

      const returned = await request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.manager)).set('User-Agent', 'BSC-Return').send({ reason: '  <strong>Cần bổ sung minh chứng.</strong>  ' }).expect(200);
      assert.equal(returned.body.status, 'RETURNED'); assert.equal(returned.body.locked_at, null);
      const returnHistory = returned.body.bsc_status_histories.at(-1);
      assert.equal(returnHistory.from_status, 'SUBMITTED'); assert.equal(returnHistory.to_status, 'RETURNED');
      assert.equal(returnHistory.comment, 'Cần bổ sung minh chứng.'); assert.equal(returnHistory.users.id, manager.id);
      const item = returned.body.employee_bsc_items[0];
      await request(server).patch(`/employee-bsc/${bsc.id}/items/${item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 90, employeeNote: 'Đã bổ sung' }).expect(200);
      await request(server).patch(`/employee-bsc/${bsc.id}/items/${item.id}`).set(auth(tokens.manager)).send({ targetValue: 90 }).expect(200);
      await request(server).patch(`/employee-bsc/${bsc.id}`).set(auth(tokens.employee)).send({ employeeComment: 'Đã chỉnh sửa' }).expect(200);

      const resubmitted = await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee)).send({}).expect(200);
      assert.equal(resubmitted.body.status, 'SUBMITTED');
      assert.deepEqual(resubmitted.body.bsc_status_histories.map((entry: { from_status: string; to_status: string }) => [entry.from_status, entry.to_status]), [
        ['DRAFT', 'SUBMITTED'], ['SUBMITTED', 'RETURNED'], ['RETURNED', 'SUBMITTED'],
      ]);
      assert.equal(resubmitted.body.bsc_status_histories[1].comment, 'Cần bổ sung minh chứng.');
      const review = await prisma.bsc_reviews.findFirstOrThrow({ where: { employee_bsc_id: bsc.id, action: 'RETURN' } });
      assert.equal(review.comment, 'Cần bổ sung minh chứng.');
      const step = await prisma.bsc_approval_steps.findUniqueOrThrow({ where: { employee_bsc_id_step_order: { employee_bsc_id: bsc.id, step_order: 1 } } });
      assert.equal(step.status, 'PENDING'); assert.equal(step.comment, null); assert.equal(step.acted_at, null);

      await request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.manager)).send({}).expect(200);
      const approvedReturn = await request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.manager)).send({ reason: 'Too late' }).expect(409);
      assert.equal(approvedReturn.body.code, 'BSC_INVALID_TRANSITION');
    });

    await t.test('concurrent approve and return commit only one decision and one success audit', async () => {
      const bsc = await createBsc('CONCURRENT_REVIEW', { ownerId: employee2.id });
      await request(server).post(`/employee-bsc/${bsc.id}/submit`).set(auth(tokens.employee2)).send({}).expect(200);
      const responses = await Promise.all([
        request(server).post(`/employee-bsc/${bsc.id}/approve`).set(auth(tokens.manager)).send({}),
        request(server).post(`/employee-bsc/${bsc.id}/return`).set(auth(tokens.manager)).send({ reason: 'Cần chỉnh sửa.' }),
      ]);
      assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
      assert.ok(['BSC_WORKFLOW_CONFLICT', 'BSC_INVALID_TRANSITION'].includes(responses.find(({ status }) => status === 409)?.body.code));
      const final = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: bsc.id } });
      assert.ok(['APPROVED', 'RETURNED'].includes(final.status));
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: bsc.id, from_status: 'SUBMITTED' } }), 1);
      assert.equal(await prisma.bsc_reviews.count({ where: { employee_bsc_id: bsc.id } }), 1);
      const successAudits = await prisma.audit_logs.findMany({ where: { entity_id: bsc.id, action: { in: ['BSC_APPROVED', 'BSC_RETURNED'] } } });
      assert.equal(successAudits.length, 1);
      assert.doesNotMatch(JSON.stringify(successAudits), /authorization|cookie|access.?token|refresh.?token|password|credential|database_url/i);
    });

    await t.test('pending review list authorizes on the backend and supports search, cycle, department, sort and pagination', async () => {
      const first = await createBsc('PENDING_FIRST');
      const second = await createBsc('PENDING_SECOND', { ownerId: employee2.id });
      const notPending = await createBsc('PENDING_DRAFT');
      const otherReviewer = await createBsc('PENDING_OTHER', { ownerId: otherEmployee.id, managerId: otherManager.id });
      await request(server).post(`/employee-bsc/${first.id}/submit`).set(auth(tokens.employee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${second.id}/submit`).set(auth(tokens.employee2)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${otherReviewer.id}/submit`).set(auth(tokens.otherEmployee)).send({}).expect(200);

      await request(server).get('/employee-bsc/pending-review').expect(401);
      await request(server).get('/employee-bsc/pending-review').set(auth(tokens.employee)).expect(403);
      await request(server).get('/employee-bsc/pending-review').set(auth(tokens.viewOnly)).expect(403);
      const page1 = await request(server).get(`/employee-bsc/pending-review?search=PENDING&departmentId=${departmentA.id}&page=1&limit=1&sortBy=submitted_at&sortOrder=asc`).set(auth(tokens.manager)).expect(200);
      const page2 = await request(server).get(`/employee-bsc/pending-review?search=PENDING&departmentId=${departmentA.id}&page=2&limit=1&sortBy=submitted_at&sortOrder=asc`).set(auth(tokens.manager)).expect(200);
      assert.equal(page1.body.total, 2); assert.equal(page2.body.total, 2); assert.notEqual(page1.body.items[0].id, page2.body.items[0].id);
      for (const item of [...page1.body.items, ...page2.body.items]) {
        assert.equal(item.status, 'SUBMITTED'); assert.equal(item.direct_manager_id, manager.id); assert.ok(item.submitted_at);
      }
      assert.ok(page1.body.filterOptions.cycles.some((cycle: { id: string }) => cycle.id === first.cycle_id));
      assert.ok(page1.body.filterOptions.departments.some((department: { id: string }) => department.id === departmentA.id));
      const cycleFiltered = await request(server).get(`/employee-bsc/pending-review?cycleId=${first.cycle_id}`).set(auth(tokens.manager)).expect(200);
      assert.deepEqual(cycleFiltered.body.items.map((item: { id: string }) => item.id), [first.id]);
      const outsideDepartment = await request(server).get(`/employee-bsc/pending-review?departmentId=${departmentB.id}`).set(auth(tokens.manager)).expect(400);
      assert.equal(outsideDepartment.body.code, 'BSC_ACCESS_DENIED');
      const otherList = await request(server).get('/employee-bsc/pending-review?search=PENDING').set(auth(tokens.otherManager)).expect(200);
      assert.deepEqual(otherList.body.items.map((item: { id: string }) => item.id), [otherReviewer.id]);
      assert.notEqual(notPending.status, 'SUBMITTED');

      await request(server).post(`/employee-bsc/${first.id}/approve`).set(auth(tokens.manager)).send({}).expect(200);
      const refreshed = await request(server).get('/employee-bsc/pending-review?search=PENDING').set(auth(tokens.manager)).expect(200);
      assert.equal(refreshed.body.total, 1); assert.deepEqual(refreshed.body.items.map((item: { id: string }) => item.id), [second.id]);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await assertFixtureClean();
    await prisma.$disconnect();
  }
});
