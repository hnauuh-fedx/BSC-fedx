import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.split('=');
  return [key, rest.join('=')];
}));
const apply = args.has('--apply');
const directorId = args.get('--director-id');
const actorId = args.get('--actor-id');
const reason = args.get('--reason')?.trim();
const requiredPermissions = [
  'bsc.plan.approve.subordinate',
  'bsc.plan.return.subordinate',
  'bsc.evaluation.approve.subordinate',
  'bsc.evaluation.return.subordinate',
  'bsc.reopen.subordinate',
];

async function main() {
  const [pendingSteps, pendingReopenRequests, eligibleDirectors] = await Promise.all([
    prisma.bsc_approval_steps.findMany({
      where: { status: 'PENDING' },
      select: { id: true, employee_bsc_id: true, stage: true, approver_id: true, approver_role: true },
      orderBy: { created_at: 'asc' },
    }),
    prisma.bsc_unlock_requests.findMany({
      where: { status: 'PENDING' },
      select: { id: true, employee_bsc_id: true, stage: true, reviewer_id: true },
      orderBy: { created_at: 'asc' },
    }),
    prisma.users.findMany({
      where: {
        status: 'ACTIVE', deleted_at: null, departments: { status: 'ACTIVE' }, positions: { status: 'ACTIVE' },
        user_roles_user_roles_user_idTousers: { some: {
          scope_type: 'GLOBAL', scope_id: null, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
          roles: { code: 'DIRECTOR', status: 'ACTIVE' },
        } },
      },
      select: { id: true, employee_code: true, full_name: true, user_roles_user_roles_user_idTousers: {
        where: { scope_type: 'GLOBAL', roles: { code: 'DIRECTOR' } },
        select: { roles: { select: { role_permissions: { select: { permissions: { select: { code: true } } } } } } },
      } },
      orderBy: { id: 'asc' },
    }),
  ]);
  const eligible = eligibleDirectors.filter(user => {
    const permissions = new Set(user.user_roles_user_roles_user_idTousers.flatMap(assignment => assignment.roles.role_permissions.map(pair => pair.permissions.code)));
    return requiredPermissions.every(permission => permissions.has(permission));
  });
  const expectedDirectorId = directorId ?? (eligible.length === 1 ? eligible[0].id : undefined);
  const steps = pendingSteps.filter(step => step.approver_role !== 'DIRECTOR' || !expectedDirectorId || step.approver_id !== expectedDirectorId);
  const reopenRequests = pendingReopenRequests.filter(request => !expectedDirectorId || request.reviewer_id !== expectedDirectorId);
  const report = {
    mode: apply ? 'APPLY' : 'REPORT_ONLY',
    pendingApprovalStepsToReassign: steps.length,
    pendingReopenRequestsToReassign: reopenRequests.length,
    eligibleDirectors: eligible.map(({ id, employee_code, full_name }) => ({ id, employeeCode: employee_code, fullName: full_name })),
    approvalStepSample: steps.slice(0, 20),
    reopenRequestSample: reopenRequests.slice(0, 20),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;
  if (!directorId || !actorId || !reason) throw new Error('--apply requires --director-id, --actor-id and --reason.');
  if (eligible.length !== 1 || eligible[0].id !== directorId) throw new Error('The selected director must be the only eligible GLOBAL DIRECTOR.');
  const actor = await prisma.users.findFirst({ where: { id: actorId, status: 'ACTIVE', deleted_at: null }, select: { id: true } });
  if (!actor) throw new Error('The audit actor is missing or inactive.');

  const appliedCounts = await prisma.$transaction(async db => {
    let approvalStepsUpdated = 0;
    let reopenRequestsUpdated = 0;
    for (const step of steps) {
      const changed = await db.bsc_approval_steps.updateMany({
        where: { id: step.id, status: 'PENDING' },
        data: { approver_id: directorId, approver_role: 'DIRECTOR' },
      });
      if (changed.count === 0) continue;
      approvalStepsUpdated += 1;
      await db.audit_logs.create({ data: {
        user_id: actorId, module: 'bsc', entity_type: 'bsc_approval_step', entity_id: step.id,
        action: 'BSC_PENDING_REVIEWER_REASSIGNED', old_data: step as Prisma.InputJsonValue,
        new_data: { approverId: directorId, approverRole: 'DIRECTOR', reason, source: 'backfill-bsc-director-reviewer' },
      } });
      await db.notifications.upsert({
        where: { dedupe_key: `BSC_PENDING_REVIEWER_REASSIGNED:${step.id}:${directorId}` },
        create: {
          recipient_id: directorId,
          actor_id: actorId,
          type: 'BSC_PENDING_REVIEWER_REASSIGNED',
          title: 'BSC chờ duyệt đã được chuyển giao',
          message: `Một BSC ở giai đoạn ${step.stage} đang chờ bạn xử lý sau khi chuẩn hóa người duyệt.`,
          entity_type: 'employee_bsc',
          entity_id: step.employee_bsc_id,
          target_path: `/management/bsc-reviews?stage=${step.stage}`,
          metadata: { stage: step.stage, approvalStepId: step.id, source: 'backfill-bsc-director-reviewer' },
          dedupe_key: `BSC_PENDING_REVIEWER_REASSIGNED:${step.id}:${directorId}`,
        },
        update: {},
      });
    }
    for (const request of reopenRequests) {
      const changed = await db.bsc_unlock_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { reviewer_id: directorId },
      });
      if (changed.count === 0) continue;
      reopenRequestsUpdated += 1;
      await db.audit_logs.create({ data: {
        user_id: actorId, module: 'bsc', entity_type: 'bsc_unlock_request', entity_id: request.id,
        action: 'BSC_PENDING_REOPEN_REVIEWER_REASSIGNED', old_data: request as Prisma.InputJsonValue,
        new_data: { reviewerId: directorId, reason, source: 'backfill-bsc-director-reviewer' },
      } });
      await db.notifications.upsert({
        where: { dedupe_key: `BSC_PENDING_REOPEN_REVIEWER_REASSIGNED:${request.id}:${directorId}` },
        create: {
          recipient_id: directorId,
          actor_id: actorId,
          type: 'BSC_PENDING_REOPEN_REVIEWER_REASSIGNED',
          title: 'Yêu cầu mở lại BSC đã được chuyển giao',
          message: `Một yêu cầu mở lại giai đoạn ${request.stage} đang chờ bạn xử lý sau khi chuẩn hóa người duyệt.`,
          entity_type: 'employee_bsc',
          entity_id: request.employee_bsc_id,
          target_path: `/management/bsc-reopen-requests?stage=${request.stage}`,
          metadata: { stage: request.stage, reopenRequestId: request.id, source: 'backfill-bsc-director-reviewer' },
          dedupe_key: `BSC_PENDING_REOPEN_REVIEWER_REASSIGNED:${request.id}:${directorId}`,
        },
        update: {},
      });
    }
    return { approvalStepsUpdated, reopenRequestsUpdated };
  });
  console.log(JSON.stringify({ applied: true, ...appliedCounts }));
}

main().finally(() => prisma.$disconnect());
