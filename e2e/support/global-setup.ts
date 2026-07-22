import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { cleanupFixture, PASSWORD, prisma, readState, removeState, saveState, type FixtureState } from './fixture';

const employeePermissions = [
  'bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own',
  'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own',
  'bsc.plan.history.view', 'bsc.evaluation.history.view',
  'bsc.reopen.request', 'bsc.version.view', 'bsc.duplicate.own',
  'bsc.statistics.personal',
];
const managerPermissions = [
  'bsc.view.subordinate', 'bsc.kpi.manage.subordinate',
  'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate',
  'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate',
  'bsc.plan.history.view', 'bsc.evaluation.history.view',
  'bsc.reopen.subordinate', 'bsc.version.view',
  'bsc.statistics.unit', 'bsc.report.export',
];
const directorPermissions = [
  'bsc.view.subordinate', 'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate',
  'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate',
  'bsc.plan.history.view', 'bsc.evaluation.history.view', 'bsc.version.view',
];
const cycleAdminPermissions = ['bsc.period.view', 'bsc.period.manage'];

export default async function globalSetup() {
  const db = prisma();
  const marker = `BSCE2E_${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
  const fixtureUsername = (suffix: string) => `${marker}_${suffix}`.toLowerCase();
  const passwordHash = await argon2.hash(PASSWORD);
  let state: FixtureState | undefined;
  try {
    try {
      const previous = await readState();
      await cleanupFixture(db, previous);
      await removeState();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    state = await db.$transaction(async (tx) => {
      const mainDepartment = await tx.departments.create({ data: { code: `${marker}_D1`, name: `${marker} Main` } });
      const otherDepartment = await tx.departments.create({ data: { code: `${marker}_D2`, name: `${marker} Outside` } });
      const position = await tx.positions.create({ data: { code: `${marker}_P1`, name: `${marker} Position`, level: 2 } });
      const createdPermissionIds: string[] = [];
      const permissions = new Map<string, string>();
      for (const code of [...new Set([...employeePermissions, ...managerPermissions, ...directorPermissions, ...cycleAdminPermissions])]) {
        const existing = await tx.permissions.findUnique({ where: { code }, select: { id: true } });
        const permission = existing ?? await tx.permissions.create({ data: { code, name: code, module: 'employee-bsc' }, select: { id: true } });
        if (!existing) createdPermissionIds.push(permission.id);
        permissions.set(code, permission.id);
      }
      const employeeRole = await tx.roles.create({ data: { code: `${marker}_EMP`, name: `${marker} Employee`, hierarchy_level: 1, is_system: false } });
      const managerRole = await tx.roles.create({ data: { code: `${marker}_MGR`, name: `${marker} Manager`, hierarchy_level: 2, is_system: false } });
      const directorRole = await tx.roles.create({ data: { code: `${marker}_DIRECTOR`, name: `${marker} Director`, hierarchy_level: 3, is_system: false } });
      const cycleAdminRole = await tx.roles.create({ data: { code: `${marker}_CYCLE_ADMIN`, name: `${marker} Cycle Admin`, hierarchy_level: 4, is_system: false } });
      await tx.role_permissions.createMany({ data: [
        ...employeePermissions.map((code) => ({ role_id: employeeRole.id, permission_id: permissions.get(code)! })),
        ...managerPermissions.map((code) => ({ role_id: managerRole.id, permission_id: permissions.get(code)! })),
        ...directorPermissions.map((code) => ({ role_id: directorRole.id, permission_id: permissions.get(code)! })),
        ...cycleAdminPermissions.map((code) => ({ role_id: cycleAdminRole.id, permission_id: permissions.get(code)! })),
      ] });
      const director = await tx.users.create({ data: { employee_code: `${marker}_DIR`, username: fixtureUsername('director'), full_name: `${marker} Director`, email: `${marker.toLowerCase()}_director@example.test`, password_hash: passwordHash, department_id: mainDepartment.id, position_id: position.id } });
      const outsideDirector = await tx.users.create({ data: { employee_code: `${marker}_OUT_DIR`, username: fixtureUsername('outside_director'), full_name: `${marker} Outside Director`, email: `${marker.toLowerCase()}_outside_director@example.test`, password_hash: passwordHash, department_id: otherDepartment.id, position_id: position.id } });
      const manager = await tx.users.create({ data: { employee_code: `${marker}_MGR`, username: fixtureUsername('manager'), full_name: `${marker} Manager`, email: `${marker.toLowerCase()}_manager@example.test`, password_hash: passwordHash, department_id: mainDepartment.id, position_id: position.id, direct_manager_id: director.id } });
      const employee = await tx.users.create({ data: { employee_code: `${marker}_EMP`, username: fixtureUsername('employee'), full_name: `${marker} Employee`, email: `${marker.toLowerCase()}_employee@example.test`, password_hash: passwordHash, department_id: mainDepartment.id, position_id: position.id, direct_manager_id: manager.id } });
      const outsideManager = await tx.users.create({ data: { employee_code: `${marker}_OUT`, username: fixtureUsername('outside_manager'), full_name: `${marker} Outside`, email: `${marker.toLowerCase()}_outside@example.test`, password_hash: passwordHash, department_id: otherDepartment.id, position_id: position.id, direct_manager_id: outsideDirector.id } });
      const outsideEmployee = await tx.users.create({ data: { employee_code: `${marker}_OUT_EMP`, username: fixtureUsername('outside_employee'), full_name: `${marker} Outside Employee`, email: `${marker.toLowerCase()}_outside_employee@example.test`, password_hash: passwordHash, department_id: otherDepartment.id, position_id: position.id, direct_manager_id: outsideManager.id } });
      await tx.user_roles.createMany({ data: [
        { user_id: employee.id, role_id: employeeRole.id, scope_type: 'SELF', scope_id: null },
        { user_id: manager.id, role_id: managerRole.id, scope_type: 'DEPARTMENT', scope_id: mainDepartment.id },
        { user_id: manager.id, role_id: cycleAdminRole.id, scope_type: 'GLOBAL', scope_id: null },
        { user_id: director.id, role_id: directorRole.id, scope_type: 'DEPARTMENT', scope_id: mainDepartment.id },
        { user_id: outsideDirector.id, role_id: directorRole.id, scope_type: 'DEPARTMENT', scope_id: otherDepartment.id },
        { user_id: outsideManager.id, role_id: managerRole.id, scope_type: 'DEPARTMENT', scope_id: otherDepartment.id },
        { user_id: outsideEmployee.id, role_id: employeeRole.id, scope_type: 'SELF', scope_id: null },
      ] });
      await tx.manager_relationships.createMany({ data: [
        { employee_id: employee.id, manager_id: manager.id, start_date: new Date(), is_primary: true },
        { employee_id: manager.id, manager_id: director.id, start_date: new Date(), is_primary: true },
        { employee_id: outsideManager.id, manager_id: outsideDirector.id, start_date: new Date(), is_primary: true },
        { employee_id: outsideEmployee.id, manager_id: outsideManager.id, start_date: new Date(), is_primary: true },
      ] });
      const year = 2090 + Math.floor(Math.random() * 9);
      const cycles: Array<{
        id: string;
        code: string;
        name: string;
        year: number;
        month: number | null;
        status: string;
      }> = [];
      for (let index = 0; index < 28; index += 1) {
        const cycleYear = year + Math.floor(index / 12);
        const cycleMonth = (index % 12) + 1;
        cycles.push(await tx.bsc_cycles.create({ data: {
          code: `${marker}_C${index + 1}`,
          name: `${marker} Cycle ${index + 1}`,
          cycle_type: 'MONTH', year: cycleYear, month: cycleMonth,
          start_date: new Date(Date.UTC(2020, 0, index + 1)),
          end_date: new Date('2199-12-31T00:00:00.000Z'),
          submission_deadline: new Date('2199-12-20T00:00:00.000Z'),
          review_deadline: new Date('2199-12-25T00:00:00.000Z'),
          status: 'OPEN', created_by: manager.id,
        } }));
      }
      const performance: string[] = [];
      for (let index = 2; index < 23; index += 1) {
        const bsc = await tx.employee_bsc.create({ data: {
          bsc_code: `${marker}_PERF${index - 1}`, cycle_id: cycles[index].id,
          employee_id: employee.id, department_id: mainDepartment.id, position_id: position.id,
          direct_manager_id: manager.id, created_by: employee.id, status: 'SUBMITTED',
          plan_status: 'APPROVED', plan_approved_at: new Date(), plan_approved_by: manager.id,
          evaluation_status: 'SUBMITTED', evaluation_submitted_at: new Date(),
        } });
        await tx.employee_bsc_items.create({ data: {
          employee_bsc_id: bsc.id, kpi_code: `${marker}_K${index}`, kpi_name: `${marker} KPI ${index}`,
          measurement_unit: '%', target_value: 100, actual_value: 90, weight: 100,
          calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id, employee_note: 'E2E performance fixture',
        } });
        performance.push(bsc.id);
      }
      const approvedFixture = async (index: number, suffix: string, evaluationApproved: boolean) => {
        const now = new Date();
        const bsc = await tx.employee_bsc.create({ data: {
          bsc_code: `${marker}_${suffix}`, cycle_id: cycles[index].id,
          employee_id: employee.id, department_id: mainDepartment.id, position_id: position.id,
          direct_manager_id: manager.id, created_by: employee.id,
          plan_status: 'APPROVED', plan_submitted_at: now, plan_approved_at: now, plan_approved_by: manager.id,
          evaluation_status: evaluationApproved ? 'APPROVED' : 'DRAFT',
          evaluation_submitted_at: evaluationApproved ? now : null,
          evaluation_approved_at: evaluationApproved ? now : null,
          evaluation_approved_by: evaluationApproved ? manager.id : null,
          manager_total_score: evaluationApproved ? 90 : null, final_score: evaluationApproved ? 90 : null,
          final_grade: evaluationApproved ? 'A' : null, locked_at: evaluationApproved ? now : null,
        } });
        const item = await tx.employee_bsc_items.create({ data: {
          employee_bsc_id: bsc.id, kpi_code: `${marker}_${suffix}_KPI`.slice(0, 50), kpi_name: `${suffix} KPI`,
          measurement_unit: '%', target_value: 100, actual_value: 90, actual_text: 'E2E actual', weight: 100,
          calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id, employee_note: 'E2E TM KQTH',
        } });
        const definition = { id: item.id, kpiCode: item.kpi_code, kpiName: item.kpi_name, description: null,
          measurementUnit: '%', targetValue: '100', targetText: null, weight: '100', calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: 0 };
        const planSnapshot = {
          formatVersion: 1, bscId: bsc.id, bscCode: bsc.bsc_code,
          cycle: { id: cycles[index].id, code: cycles[index].code, name: cycles[index].name, year: cycles[index].year, month: cycles[index].month, status: cycles[index].status },
          employee: { id: employee.id, employeeCode: employee.employee_code, fullName: employee.full_name },
          department: { id: mainDepartment.id, code: mainDepartment.code, name: mainDepartment.name },
          position: { id: position.id, code: position.code, name: position.name, level: position.level },
          reviewer: { id: manager.id, employeeCode: manager.employee_code, fullName: manager.full_name },
          planStatus: 'APPROVED', planApprovedAt: now.toISOString(), planApprovedBy: manager.id,
          evaluationStatus: evaluationApproved ? 'APPROVED' : 'DRAFT', totalWeight: 100, items: [definition],
          managerTotalScore: evaluationApproved ? '90' : null, totalScore: evaluationApproved ? '90' : null,
          finalScore: evaluationApproved ? '90' : null, finalGrade: evaluationApproved ? 'A' : null,
        };
        const planVersion = await tx.bsc_versions.create({ data: {
          employee_bsc_id: bsc.id, version_number: 1, stage: 'PLAN', version_type: 'PLAN_APPROVED',
          snapshot: planSnapshot, created_by: manager.id, created_at: now,
        } });
        if (evaluationApproved) await tx.bsc_versions.create({ data: {
          employee_bsc_id: bsc.id, version_number: 2, stage: 'EVALUATION', version_type: 'EVALUATION_APPROVED',
          snapshot: { ...planSnapshot, planVersionId: planVersion.id, evaluationStatus: 'APPROVED',
            evaluationApprovedAt: now.toISOString(), evaluationApprovedBy: manager.id,
            items: [{ ...definition, actualValue: '90', actualText: 'E2E actual', employeeNote: 'E2E TM KQTH',
              rawAchievementPercentage: 90, roundedAchievementPercentage: 90, rawWorkScore: 90, roundedWorkScore: 90, weightedScore: 90 }],
            managerTotalScore: '90', totalScore: '90', finalScore: '90', finalGrade: 'A' },
          created_by: manager.id, created_at: now,
        } });
        return bsc.id;
      };
      const reopenEvaluation = await approvedFixture(23, 'REOPEN_EVAL', true);
      const reopenPlan = await approvedFixture(24, 'REOPEN_PLAN', true);
      const duplicateSource = await approvedFixture(25, 'DUPLICATE_SOURCE', false);
      const managerApproval = await tx.employee_bsc.create({ data: {
        bsc_code: `${marker}_MANAGER_PLAN`, cycle_id: cycles[27].id,
        employee_id: manager.id, department_id: mainDepartment.id, position_id: position.id,
        direct_manager_id: director.id, created_by: manager.id,
        plan_status: 'SUBMITTED', plan_submitted_at: new Date(), evaluation_status: 'NOT_STARTED',
      } });
      await tx.employee_bsc_items.create({ data: {
        employee_bsc_id: managerApproval.id, kpi_code: `${marker}_MANAGER_KPI`.slice(0, 50), kpi_name: 'Manager approval KPI',
        measurement_unit: '%', target_value: 100, weight: 100,
        calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: director.id,
      } });
      await tx.bsc_approval_steps.create({ data: {
        employee_bsc_id: managerApproval.id,
        stage: 'PLAN',
        step_order: 1,
        approver_id: director.id,
        approver_role: 'DIRECTOR',
        status: 'PENDING',
      } });
      const outsideEmployeeBsc = await tx.employee_bsc.create({ data: {
        bsc_code: `${marker}_OUTSIDE_EMPLOYEE_PLAN`.slice(0, 50), cycle_id: cycles[0].id,
        employee_id: outsideEmployee.id, department_id: otherDepartment.id, position_id: position.id,
        direct_manager_id: outsideManager.id, created_by: outsideEmployee.id,
        plan_status: 'SUBMITTED', plan_submitted_at: new Date(), evaluation_status: 'NOT_STARTED',
      } });
      const outsideManagerApproval = await tx.employee_bsc.create({ data: {
        bsc_code: `${marker}_OUTSIDE_MANAGER_PLAN`.slice(0, 50), cycle_id: cycles[1].id,
        employee_id: outsideManager.id, department_id: otherDepartment.id, position_id: position.id,
        direct_manager_id: outsideDirector.id, created_by: outsideManager.id,
        plan_status: 'SUBMITTED', plan_submitted_at: new Date(), evaluation_status: 'NOT_STARTED',
      } });
      for (const [bsc, approver, roleCode] of [[outsideEmployeeBsc, outsideManager, 'MANAGER'], [outsideManagerApproval, outsideDirector, 'DIRECTOR']] as const) {
        await tx.employee_bsc_items.create({ data: { employee_bsc_id: bsc.id, kpi_code: `${marker}_${roleCode}_OUT_KPI`.slice(0, 50), kpi_name: 'Outside approval KPI', target_value: 100, weight: 100, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: approver.id } });
        await tx.bsc_approval_steps.create({ data: { employee_bsc_id: bsc.id, stage: 'PLAN', step_order: 1, approver_id: approver.id, approver_role: roleCode, status: 'PENDING' } });
      }
      return {
        marker, password: PASSWORD, mainDepartmentId: mainDepartment.id, otherDepartmentId: otherDepartment.id,
        positionId: position.id,
        manager: { id: manager.id, username: manager.username, email: manager.email }, employee: { id: employee.id, username: employee.username, email: employee.email },
        director: { id: director.id, username: director.username, email: director.email },
        outsideDirector: { id: outsideDirector.id, username: outsideDirector.username, email: outsideDirector.email },
        outsideManager: { id: outsideManager.id, username: outsideManager.username, email: outsideManager.email },
        outsideEmployee: { id: outsideEmployee.id, username: outsideEmployee.username, email: outsideEmployee.email },
        cycleIds: { flow: cycles[0].id, underweight: cycles[1].id, performance, duplicateTargets: [cycles[26].id, cycles[27].id] },
        bscIds: { reopenEvaluation, reopenPlan, duplicateSource, managerApproval: managerApproval.id,
          outsideEmployee: outsideEmployeeBsc.id, outsideManagerApproval: outsideManagerApproval.id }, createdPermissionIds,
      } satisfies FixtureState;
    }, { timeout: 30_000 });
    await saveState(state);
  } catch (error) {
    if (state) {
      try { await cleanupFixture(db, state); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'E2E setup and cleanup both failed.'); }
    }
    throw error;
  } finally { await db.$disconnect(); }
}
