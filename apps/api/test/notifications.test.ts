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
};

test('publisher resolves a personal PLAN submission to the direct reviewer and deduplicates by source event', async () => {
  let upsertArgs: unknown;
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
  assert.equal(args.create.recipient_id, id.manager);
  assert.equal(args.create.actor_id, id.actor);
  assert.equal(args.create.target_path, `/employee-bsc/${id.bsc}`);
  assert.match(args.create.message, /Nguyễn Văn An/);
  assert.equal(args.where.dedupe_key, `${NOTIFICATION_EVENT.EMPLOYEE_BSC_PLAN_SUBMITTED}:${id.source}:${id.manager}`);
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

test('reopen requests navigate each reviewer to the actionable queue', async () => {
  const personalRequestId = '00000000-0000-4000-8000-000000000006';
  const departmentRequestId = '00000000-0000-4000-8000-000000000007';
  const departmentId = '00000000-0000-4000-8000-000000000008';
  const managerId = '00000000-0000-4000-8000-000000000009';
  const creates: Array<{ recipient_id: string; target_path: string }> = [];
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
      findUnique: async () => ({ id: id.bsc, bsc_code: 'BSC_NV001', employee_id: id.employee }),
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
    users: { findUnique: async () => ({ full_name: 'Nguyễn Văn An' }) },
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
    { recipient_id: id.manager, target_path: '/management/bsc-reopen-requests?stage=EVALUATION' },
    { recipient_id: id.manager, target_path: '/management/department-bsc-reviews?stage=REOPEN' },
  ]);
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
