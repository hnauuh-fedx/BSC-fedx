import { Prisma, PrismaClient } from '@prisma/client';
import { DIRECTOR_REVIEW_PERMISSIONS } from '../src/modules/bsc-reviewers/bsc-reviewer-resolver';

const prisma = new PrismaClient();
const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.split('=');
  return [key, rest.join('=')];
}));
const apply = args.has('--apply');
const actorId = args.get('--actor-id');
const reason = args.get('--reason')?.trim();
const requiredPermissions = Object.values(DIRECTOR_REVIEW_PERMISSIONS).flat();

async function main() {
  const now = new Date();
  const [pendingSteps, pendingReopenRequests, directorRows] = await Promise.all([
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
        status: 'ACTIVE',
        deleted_at: null,
        departments: { status: 'ACTIVE' },
        positions: { status: 'ACTIVE' },
        user_roles_user_roles_user_idTousers: { some: {
          scope_type: 'GLOBAL',
          scope_id: null,
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
          roles: { code: 'DIRECTOR', status: 'ACTIVE' },
        } },
      },
      select: {
        id: true,
        employee_code: true,
        full_name: true,
        user_roles_user_roles_user_idTousers: {
          where: {
            scope_type: 'GLOBAL',
            scope_id: null,
            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            roles: { code: 'DIRECTOR', status: 'ACTIVE' },
          },
          select: { roles: { select: { role_permissions: { select: { permissions: { select: { code: true } } } } } } },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const directors = directorRows.map((user) => ({
    ...user,
    permissions: new Set(user.user_roles_user_roles_user_idTousers
      .flatMap((assignment) => assignment.roles.role_permissions.map((pair) => pair.permissions.code))),
  })).filter((user) => requiredPermissions.some((permission) => user.permissions.has(permission)));
  const steps = pendingSteps.filter((step) => step.approver_role !== 'DIRECTOR' || step.approver_id !== null);
  const reopenRequests = pendingReopenRequests.filter((request) => request.reviewer_id !== null);

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'REPORT_ONLY',
    pendingApprovalStepsToNormalize: steps.length,
    pendingReopenRequestsToNormalize: reopenRequests.length,
    eligibleDirectors: directors.map(({ id, employee_code, full_name, permissions }) => ({
      id,
      employeeCode: employee_code,
      fullName: full_name,
      permissions: [...permissions].filter((permission) => requiredPermissions.includes(permission)),
    })),
    approvalStepSample: steps.slice(0, 20),
    reopenRequestSample: reopenRequests.slice(0, 20),
  }, null, 2));

  if (!apply) return;
  if (!actorId || !reason) throw new Error('--apply requires --actor-id and --reason.');
  if (directors.length === 0) throw new Error('No eligible GLOBAL DIRECTOR is available for the shared queue.');
  const actor = await prisma.users.findFirst({
    where: { id: actorId, status: 'ACTIVE', deleted_at: null },
    select: { id: true },
  });
  if (!actor) throw new Error('The audit actor is missing or inactive.');

  const appliedCounts = await prisma.$transaction(async (db) => {
    let approvalStepsUpdated = 0;
    let reopenRequestsUpdated = 0;

    for (const step of steps) {
      const permissions = step.stage === 'PLAN'
        ? DIRECTOR_REVIEW_PERMISSIONS.PLAN
        : DIRECTOR_REVIEW_PERMISSIONS.EVALUATION;
      const recipients = directors.filter((director) => permissions.some((permission) => director.permissions.has(permission)));
      if (recipients.length === 0) throw new Error(`No eligible DIRECTOR can review ${step.stage} approval step ${step.id}.`);
      const changed = await db.bsc_approval_steps.updateMany({
        where: { id: step.id, status: 'PENDING' },
        data: { approver_id: null, approver_role: 'DIRECTOR' },
      });
      if (changed.count === 0) continue;
      approvalStepsUpdated += 1;
      await db.audit_logs.create({ data: {
        user_id: actorId,
        module: 'bsc',
        entity_type: 'bsc_approval_step',
        entity_id: step.id,
        action: 'BSC_PENDING_REVIEWER_POOL_NORMALIZED',
        old_data: step as Prisma.InputJsonValue,
        new_data: {
          approverId: null,
          approverRole: 'DIRECTOR',
          reviewerPoolIds: recipients.map(({ id }) => id),
          reason,
          source: 'backfill-bsc-director-reviewer',
        },
      } });
      for (const recipient of recipients) await notify(db, {
        actorId,
        recipientId: recipient.id,
        type: 'BSC_PENDING_REVIEWER_POOL_NORMALIZED',
        sourceId: step.id,
        entityId: step.employee_bsc_id,
        stage: step.stage,
        targetPath: `/management/bsc-reviews?stage=${step.stage}`,
        title: 'BSC chờ duyệt đã vào hàng đợi chung',
        message: `Một BSC ở giai đoạn ${step.stage} đang chờ Giám đốc xử lý trong hàng đợi chung.`,
      });
    }

    for (const request of reopenRequests) {
      const recipients = directors.filter((director) => DIRECTOR_REVIEW_PERMISSIONS.REOPEN
        .some((permission) => director.permissions.has(permission)));
      if (recipients.length === 0) throw new Error(`No eligible DIRECTOR can review reopen request ${request.id}.`);
      const changed = await db.bsc_unlock_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { reviewer_id: null },
      });
      if (changed.count === 0) continue;
      reopenRequestsUpdated += 1;
      await db.audit_logs.create({ data: {
        user_id: actorId,
        module: 'bsc',
        entity_type: 'bsc_unlock_request',
        entity_id: request.id,
        action: 'BSC_PENDING_REOPEN_REVIEWER_POOL_NORMALIZED',
        old_data: request as Prisma.InputJsonValue,
        new_data: {
          reviewerId: null,
          reviewerPoolIds: recipients.map(({ id }) => id),
          reason,
          source: 'backfill-bsc-director-reviewer',
        },
      } });
      for (const recipient of recipients) await notify(db, {
        actorId,
        recipientId: recipient.id,
        type: 'BSC_PENDING_REOPEN_REVIEWER_POOL_NORMALIZED',
        sourceId: request.id,
        entityId: request.employee_bsc_id,
        stage: request.stage,
        targetPath: `/management/bsc-reopen-requests?stage=${request.stage}`,
        title: 'Yêu cầu mở lại BSC đã vào hàng đợi chung',
        message: `Một yêu cầu mở lại giai đoạn ${request.stage} đang chờ Giám đốc xử lý trong hàng đợi chung.`,
      });
    }
    return { approvalStepsUpdated, reopenRequestsUpdated };
  });
  console.log(JSON.stringify({ applied: true, ...appliedCounts }));
}

function notify(db: Prisma.TransactionClient, input: {
  actorId: string;
  recipientId: string;
  type: string;
  sourceId: string;
  entityId: string;
  stage: string;
  targetPath: string;
  title: string;
  message: string;
}) {
  const dedupeKey = `${input.type}:${input.sourceId}:${input.recipientId}`;
  return db.notifications.upsert({
    where: { dedupe_key: dedupeKey },
    create: {
      recipient_id: input.recipientId,
      actor_id: input.actorId,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: 'employee_bsc',
      entity_id: input.entityId,
      target_path: input.targetPath,
      metadata: { stage: input.stage, source: 'backfill-bsc-director-reviewer' },
      dedupe_key: dedupeKey,
    },
    update: {},
  });
}

main().finally(() => prisma.$disconnect());
