import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { NotificationPublisher } from '../src/modules/notifications/notifications.publisher';
import { NOTIFICATION_EVENT } from '../src/modules/notifications/notifications.types';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

const id = {
  bsc: '00000000-0000-4000-8000-000000000001',
  employee: '00000000-0000-4000-8000-000000000002',
  manager: '00000000-0000-4000-8000-000000000003',
  actor: '00000000-0000-4000-8000-000000000004',
  source: '00000000-0000-4000-8000-000000000005',
  director: '00000000-0000-4000-8000-000000000010',
  department: '00000000-0000-4000-8000-000000000011',
};

test('publisher resolves a personal PLAN submission to an eligible director and deduplicates by source event', async () => {
  let upsertArgs: unknown;
  let directorQuery: unknown;
  const db = {
    employee_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        bsc_code: 'BSC_NV001',
        employee_id: id.employee,
        department_id: id.department,
      }),
    },
    users: {
      findUnique: async () => ({ full_name: 'Nguyễn Văn An' }),
      findMany: async (args: unknown) => {
        directorQuery = args;
        return [{ id: id.director }];
      },
    },
    notifications: {
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return { id: 'notification-id' };
      },
    },
  } as unknown as Prisma.TransactionClient;

  await new NotificationPublisher().publish(db, {
    type: NOTIFICATION_EVENT.EMPLOYEE_BSC_PLAN_SUBMITTED,
    resourceId: id.bsc,
    sourceId: id.source,
    actorId: id.actor,
  });

  const args = upsertArgs as {
    where: { dedupe_key: string };
    create: { recipient_id: string; actor_id: string; target_path: string; message: string };
  };
  assert.equal(args.create.recipient_id, id.director);
  assert.equal(args.create.actor_id, id.actor);
  assert.equal(args.create.target_path, `/employee-bsc/${id.bsc}`);
  assert.match(args.create.message, /Nguyễn Văn An/);
  assert.equal(args.where.dedupe_key, `${NOTIFICATION_EVENT.EMPLOYEE_BSC_PLAN_SUBMITTED}:${id.source}:${id.director}`);
  assert.deepEqual(
    (directorQuery as {
      where: {
        user_roles_user_roles_user_idTousers: {
          some: { roles: { role_permissions: { some: { permissions: { code: string } } } } };
        };
      };
    }).where.user_roles_user_roles_user_idTousers.some.roles.role_permissions.some.permissions,
    { code: 'bsc.plan.approve.subordinate' },
  );
});

test('publisher sends a personal review result back to the BSC owner', async () => {
  let recipient = '';
  const db = {
    employee_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        bsc_code: 'BSC_NV001',
        employee_id: id.employee,
        direct_manager_id: id.manager,
      }),
    },
    users: { findUnique: async () => ({ full_name: 'Nguyễn Văn An' }) },
    notifications: {
      upsert: async (args: { create: { recipient_id: string } }) => {
        recipient = args.create.recipient_id;
        return { id: 'notification-id' };
      },
    },
  } as unknown as Prisma.TransactionClient;

  await new NotificationPublisher().publish(db, {
    type: NOTIFICATION_EVENT.EMPLOYEE_BSC_EVALUATION_RETURNED,
    resourceId: id.bsc,
    sourceId: id.source,
    actorId: id.manager,
  });

  assert.equal(recipient, id.employee);
});

test('publisher sends a personal EVALUATION submission to every eligible director in scope', async () => {
  const secondDirector = '00000000-0000-4000-8000-000000000012';
  const recipients: string[] = [];
  let directorQuery: unknown;
  const db = {
    employee_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        bsc_code: 'BSC_QL001',
        employee_id: id.manager,
        department_id: id.department,
      }),
    },
    users: {
      findUnique: async () => ({ full_name: 'Trưởng phòng' }),
      findMany: async (args: unknown) => {
        directorQuery = args;
        return [{ id: id.director }, { id: secondDirector }];
      },
    },
    notifications: {
      upsert: async (args: { create: { recipient_id: string } }) => {
        recipients.push(args.create.recipient_id);
        return { id: `notification-${recipients.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;

  await new NotificationPublisher().publish(db, {
    type: NOTIFICATION_EVENT.EMPLOYEE_BSC_EVALUATION_SUBMITTED,
    resourceId: id.bsc,
    sourceId: id.source,
    actorId: id.manager,
  });

  assert.deepEqual(recipients, [id.director, secondDirector]);
  assert.doesNotMatch(recipients.join(','), new RegExp(id.manager));
  const where = (directorQuery as {
    where: {
      id: { not: string };
      status: string;
      deleted_at: null;
      departments: { status: string };
      positions: { status: string };
      user_roles_user_roles_user_idTousers: {
        some: {
          AND: [
            { OR: [{ expires_at: null }, { expires_at: { gt: Date } }] },
            { OR: [{ scope_type: string }, { scope_type: string; scope_id: string }] },
          ];
          roles: {
            code: string;
            status: string;
            role_permissions: { some: { permissions: { code: string } } };
          };
        };
      };
    };
  }).where;
  assert.deepEqual(
    {
      id: where.id,
      status: where.status,
      deleted_at: where.deleted_at,
      departments: where.departments,
      positions: where.positions,
    },
    {
      id: { not: id.manager },
      status: 'ACTIVE',
      deleted_at: null,
      departments: { status: 'ACTIVE' },
      positions: { status: 'ACTIVE' },
    },
  );
  const assignment = where.user_roles_user_roles_user_idTousers.some;
  assert.equal(assignment.AND[0].OR[0].expires_at, null);
  assert.ok(assignment.AND[0].OR[1].expires_at.gt instanceof Date);
  assert.deepEqual(assignment.AND[1].OR, [
    { scope_type: 'GLOBAL' },
    { scope_type: 'DEPARTMENT', scope_id: id.department },
  ]);
  assert.deepEqual(assignment.roles, {
    code: 'DIRECTOR',
    status: 'ACTIVE',
    role_permissions: { some: { permissions: { code: 'bsc.evaluation.approve.subordinate' } } },
  });
});

test('publisher neither blocks the workflow nor falls back to the direct manager when no eligible director exists', async () => {
  let upsertCalled = false;
  const db = {
    employee_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        bsc_code: 'BSC_NV001',
        employee_id: id.employee,
        department_id: id.department,
      }),
    },
    users: {
      findUnique: async () => ({ full_name: 'Nhân viên' }),
      findMany: async () => [],
    },
    notifications: {
      upsert: async () => {
        upsertCalled = true;
        return { id: 'notification-id' };
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await new NotificationPublisher().publish(db, {
    type: NOTIFICATION_EVENT.EMPLOYEE_BSC_PLAN_SUBMITTED,
    resourceId: id.bsc,
    sourceId: id.source,
    actorId: id.employee,
  });
  assert.deepEqual(result, []);
  assert.equal(upsertCalled, false);
});

test('reopen requests navigate each reviewer to the actionable queue', async () => {
  const personalRequestId = '00000000-0000-4000-8000-000000000006';
  const departmentRequestId = '00000000-0000-4000-8000-000000000007';
  const departmentId = '00000000-0000-4000-8000-000000000008';
  const managerId = '00000000-0000-4000-8000-000000000009';
  const creates: Array<{ recipient_id: string; target_path: string }> = [];
  let reopenDirectorQuery: unknown;
  const db = {
    bsc_unlock_requests: {
      findUnique: async () => ({
        id: personalRequestId,
        employee_bsc_id: id.bsc,
        stage: 'EVALUATION',
        requested_by: id.employee,
        reviewer_id: id.manager,
      }),
    },
    employee_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        bsc_code: 'BSC_NV001',
        employee_id: id.employee,
        department_id: id.department,
      }),
    },
    department_bsc_unlock_requests: {
      findUnique: async () => ({
        id: departmentRequestId,
        department_bsc_id: id.bsc,
        stage: 'PLAN',
        requested_by: managerId,
        reviewer_id: id.manager,
      }),
    },
    department_bsc: {
      findUnique: async () => ({ id: id.bsc, department_id: departmentId }),
    },
    departments: { findUnique: async () => ({ name: 'Phòng Kinh doanh' }) },
    users: {
      findUnique: async () => ({ full_name: 'Nguyễn Văn An' }),
      findMany: async (args: unknown) => {
        reopenDirectorQuery = args;
        return [{ id: id.director }];
      },
    },
    notifications: {
      upsert: async (args: { create: { recipient_id: string; target_path: string } }) => {
        creates.push({
          recipient_id: args.create.recipient_id,
          target_path: args.create.target_path,
        });
        return { id: `notification-${creates.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const publisher = new NotificationPublisher();

  await publisher.publish(db, {
    type: NOTIFICATION_EVENT.EMPLOYEE_BSC_REOPEN_REQUESTED,
    resourceId: personalRequestId,
    sourceId: personalRequestId,
    actorId: id.employee,
  });
  await publisher.publish(db, {
    type: NOTIFICATION_EVENT.DEPARTMENT_BSC_REOPEN_REQUESTED,
    resourceId: departmentRequestId,
    sourceId: departmentRequestId,
    actorId: managerId,
  });

  assert.deepEqual(creates, [
    { recipient_id: id.director, target_path: '/management/bsc-reopen-requests?stage=EVALUATION' },
    { recipient_id: id.manager, target_path: '/management/department-bsc-reviews?stage=REOPEN' },
  ]);
  assert.deepEqual(
    (reopenDirectorQuery as {
      where: {
        user_roles_user_roles_user_idTousers: {
          some: { roles: { role_permissions: { some: { permissions: { code: string } } } } };
        };
      };
    }).where.user_roles_user_roles_user_idTousers.some.roles.role_permissions.some.permissions,
    { code: 'bsc.reopen.subordinate' },
  );
});

test('publisher preserves department BSC submission and review-result recipients', async () => {
  const recipients: string[] = [];
  const db = {
    department_bsc: {
      findUnique: async () => ({
        id: id.bsc,
        department_id: id.department,
        responsible_manager_id: id.manager,
        reviewer_id: id.director,
      }),
    },
    departments: { findUnique: async () => ({ name: 'Phòng Kinh doanh' }) },
    notifications: {
      upsert: async (args: { create: { recipient_id: string } }) => {
        recipients.push(args.create.recipient_id);
        return { id: `notification-${recipients.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const publisher = new NotificationPublisher();

  await publisher.publish(db, {
    type: NOTIFICATION_EVENT.DEPARTMENT_BSC_PLAN_SUBMITTED,
    resourceId: id.bsc,
    sourceId: `${id.source}-plan`,
    actorId: id.manager,
  });
  await publisher.publish(db, {
    type: NOTIFICATION_EVENT.DEPARTMENT_BSC_EVALUATION_APPROVED,
    resourceId: id.bsc,
    sourceId: `${id.source}-evaluation`,
    actorId: id.director,
  });

  assert.deepEqual(recipients, [id.director, id.manager]);
});

test('notification feed is always scoped to the authenticated recipient', async () => {
  const calls: Array<{ operation: string; args: unknown }> = [];
  const createdAt = new Date('2026-07-28T02:00:00.000Z');
  const prisma = {
    notifications: {
      findMany: async (args: unknown) => {
        calls.push({ operation: 'findMany', args });
        return [{
          id: id.source,
          type: NOTIFICATION_EVENT.EMPLOYEE_BSC_PLAN_APPROVED,
          title: 'Đã duyệt',
          message: 'Kế hoạch đã được duyệt.',
          entity_type: 'employee_bsc',
          entity_id: id.bsc,
          target_path: `/employee-bsc/${id.bsc}`,
          metadata: { stage: 'PLAN' },
          read_at: null,
          created_at: createdAt,
          actor: { id: id.manager, full_name: 'Quản lý' },
        }];
      },
      count: async (args: unknown) => {
        calls.push({ operation: 'count', args });
        return 1;
      },
    },
  } as unknown as PrismaService;

  const result = await new NotificationsService(prisma).list(id.employee, {
    limit: 20,
    unreadOnly: true,
  });

  assert.equal(result.items[0]?.entityType, 'employee_bsc');
  assert.equal(result.items[0]?.actor?.fullName, 'Quản lý');
  const findMany = calls.find((call) => call.operation === 'findMany')?.args as {
    where: { recipient_id: string; read_at: null };
  };
  assert.deepEqual(findMany.where, { recipient_id: id.employee, read_at: null });
});

test('a user cannot mark another recipient notification as read', async () => {
  let updateCalled = false;
  const prisma = {
    notifications: {
      findFirst: async () => null,
      update: async () => {
        updateCalled = true;
        return {};
      },
    },
  } as unknown as PrismaService;

  await assert.rejects(
    new NotificationsService(prisma).markRead(id.employee, id.source),
    (error) => error instanceof NotFoundException
      && (error.getResponse() as { code?: string }).code === 'NOTIFICATION_NOT_FOUND',
  );
  assert.equal(updateCalled, false);
});

test('mark all read updates only unread rows owned by the recipient', async () => {
  let updateWhere: unknown;
  const prisma = {
    notifications: {
      updateMany: async (args: { where: unknown }) => {
        updateWhere = args.where;
        return { count: 3 };
      },
    },
  } as unknown as PrismaService;

  const result = await new NotificationsService(prisma).markAllRead(id.employee);
  assert.deepEqual(updateWhere, { recipient_id: id.employee, read_at: null });
  assert.deepEqual(result, { updated: 3 });
});
