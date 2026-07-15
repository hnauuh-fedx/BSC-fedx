import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { cleanupFixture, PASSWORD, prisma, readState, removeState, saveState, type FixtureState } from './fixture';

const employeePermissions = [
  'bsc.create.own', 'bsc.view.own', 'bsc.edit.own', 'bsc.delete.own',
  'bsc.actual.update.own', 'bsc.plan.submit.own', 'bsc.evaluation.submit.own',
  'bsc.plan.history.view', 'bsc.evaluation.history.view',
  'bsc.reopen.request', 'bsc.version.view', 'bsc.duplicate.own',
];
const managerPermissions = [
  'bsc.view.subordinate', 'bsc.kpi.manage.subordinate',
  'bsc.plan.approve.subordinate', 'bsc.plan.return.subordinate',
  'bsc.evaluation.approve.subordinate', 'bsc.evaluation.return.subordinate',
  'bsc.plan.history.view', 'bsc.evaluation.history.view',
  'bsc.reopen.subordinate', 'bsc.version.view',
];

export default async function globalSetup() {
  const db = prisma();
  const marker = `BSCE2E_${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
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
      for (const code of [...new Set([...employeePermissions, ...managerPermissions])]) {
        const existing = await tx.permissions.findUnique({ where: { code }, select: { id: true } });
        const permission = existing ?? await tx.permissions.create({ data: { code, name: code, module: 'employee-bsc' }, select: { id: true } });
        if (!existing) createdPermissionIds.push(permission.id);
        permissions.set(code, permission.id);
      }
      const employeeRole = await tx.roles.create({ data: { code: `${marker}_EMP`, name: `${marker} Employee`, hierarchy_level: 1, is_system: false } });
      const managerRole = await tx.roles.create({ data: { code: `${marker}_MGR`, name: `${marker} Manager`, hierarchy_level: 2, is_system: false } });
      await tx.role_permissions.createMany({ data: [
        ...employeePermissions.map((code) => ({ role_id: employeeRole.id, permission_id: permissions.get(code)! })),
        ...managerPermissions.map((code) => ({ role_id: managerRole.id, permission_id: permissions.get(code)! })),
      ] });
      const manager = await tx.users.create({ data: { employee_code: `${marker}_MGR`, full_name: `${marker} Manager`, email: `${marker.toLowerCase()}_manager@example.test`, password_hash: passwordHash, department_id: mainDepartment.id, position_id: position.id } });
      const employee = await tx.users.create({ data: { employee_code: `${marker}_EMP`, full_name: `${marker} Employee`, email: `${marker.toLowerCase()}_employee@example.test`, password_hash: passwordHash, department_id: mainDepartment.id, position_id: position.id, direct_manager_id: manager.id } });
      const outsideManager = await tx.users.create({ data: { employee_code: `${marker}_OUT`, full_name: `${marker} Outside`, email: `${marker.toLowerCase()}_outside@example.test`, password_hash: passwordHash, department_id: otherDepartment.id, position_id: position.id } });
      await tx.user_roles.createMany({ data: [
        { user_id: employee.id, role_id: employeeRole.id, scope_type: 'SELF', scope_id: null },
        { user_id: manager.id, role_id: managerRole.id, scope_type: 'DEPARTMENT', scope_id: mainDepartment.id },
        { user_id: outsideManager.id, role_id: managerRole.id, scope_type: 'DEPARTMENT', scope_id: otherDepartment.id },
      ] });
      await tx.manager_relationships.create({ data: { employee_id: employee.id, manager_id: manager.id, start_date: new Date(), is_primary: true } });
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
          start_date: new Date(`${cycleYear}-${String(cycleMonth).padStart(2, '0')}-01T00:00:00.000Z`),
          end_date: new Date(`${cycleYear}-${String(cycleMonth).padStart(2, '0')}-28T00:00:00.000Z`),
          submission_deadline: new Date(`${cycleYear}-${String(cycleMonth).padStart(2, '0')}-25T00:00:00.000Z`),
          review_deadline: new Date(`${cycleYear}-${String(cycleMonth).padStart(2, '0')}-27T00:00:00.000Z`),
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
      return {
        marker, password: PASSWORD, mainDepartmentId: mainDepartment.id, otherDepartmentId: otherDepartment.id,
        positionId: position.id,
        manager: { id: manager.id, email: manager.email }, employee: { id: employee.id, email: employee.email },
        outsideManager: { id: outsideManager.id, email: outsideManager.email },
        cycleIds: { flow: cycles[0].id, underweight: cycles[1].id, performance, duplicateTargets: [cycles[26].id, cycles[27].id] },
        bscIds: { reopenEvaluation, reopenPlan, duplicateSource }, createdPermissionIds,
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
