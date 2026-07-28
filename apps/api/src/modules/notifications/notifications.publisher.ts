import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationEvent, NotificationEventType, NotificationStage } from './notifications.types';

interface NotificationDraft {
  recipientId: string;
  title: string;
  message: string;
  entityType: 'employee_bsc' | 'department_bsc';
  entityId: string;
  targetPath: string;
  metadata: Prisma.InputJsonValue;
}

const EMPLOYEE_EVENTS = new Set<NotificationEventType>([
  'EMPLOYEE_BSC_PLAN_SUBMITTED',
  'EMPLOYEE_BSC_PLAN_APPROVED',
  'EMPLOYEE_BSC_PLAN_RETURNED',
  'EMPLOYEE_BSC_EVALUATION_SUBMITTED',
  'EMPLOYEE_BSC_EVALUATION_APPROVED',
  'EMPLOYEE_BSC_EVALUATION_RETURNED',
]);

const EMPLOYEE_REOPEN_EVENTS = new Set<NotificationEventType>([
  'EMPLOYEE_BSC_REOPEN_REQUESTED',
  'EMPLOYEE_BSC_REOPEN_APPROVED',
  'EMPLOYEE_BSC_REOPEN_REJECTED',
]);

const DEPARTMENT_EVENTS = new Set<NotificationEventType>([
  'DEPARTMENT_BSC_PLAN_SUBMITTED',
  'DEPARTMENT_BSC_PLAN_APPROVED',
  'DEPARTMENT_BSC_PLAN_RETURNED',
  'DEPARTMENT_BSC_EVALUATION_SUBMITTED',
  'DEPARTMENT_BSC_EVALUATION_APPROVED',
  'DEPARTMENT_BSC_EVALUATION_RETURNED',
]);

@Injectable()
export class NotificationPublisher {
  async publish(db: Prisma.TransactionClient, event: NotificationEvent) {
    const drafts = await this.resolveDrafts(db, event);
    return Promise.all(drafts.map((draft) => {
      const dedupeKey = `${event.type}:${event.sourceId}:${draft.recipientId}`;
      return db.notifications.upsert({
        where: { dedupe_key: dedupeKey },
        create: {
          recipient_id: draft.recipientId,
          actor_id: event.actorId,
          type: event.type,
          title: draft.title,
          message: draft.message,
          entity_type: draft.entityType,
          entity_id: draft.entityId,
          target_path: draft.targetPath,
          metadata: draft.metadata,
          dedupe_key: dedupeKey,
        },
        update: {},
      });
    }));
  }

  private async resolveDrafts(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft[]> {
    if (EMPLOYEE_EVENTS.has(event.type)) return this.employeeBscDrafts(db, event);
    if (EMPLOYEE_REOPEN_EVENTS.has(event.type)) return this.employeeReopenDrafts(db, event);
    if (DEPARTMENT_EVENTS.has(event.type)) return [await this.departmentBscDraft(db, event)];
    return [await this.departmentReopenDraft(db, event)];
  }

  private async employeeBscDrafts(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft[]> {
    const bsc = await db.employee_bsc.findUnique({
      where: { id: event.resourceId },
      select: { id: true, bsc_code: true, employee_id: true, department_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const submitted = event.type.endsWith('_SUBMITTED');
    const owner = await db.users.findUnique({ where: { id: bsc.employee_id }, select: { full_name: true } });
    const { stage, action } = this.stageAction(event.type);
    const recipientIds = submitted
      ? await this.directorRecipientIds(db, bsc.department_id, bsc.employee_id, this.approvalPermission(stage))
      : [bsc.employee_id];
    return recipientIds.map((recipientId) => ({
      recipientId,
      ...this.copy(stage, action, 'cá nhân', owner?.full_name ?? bsc.bsc_code),
      entityType: 'employee_bsc',
      entityId: bsc.id,
      targetPath: `/employee-bsc/${bsc.id}`,
      metadata: { stage, action, bscId: bsc.id },
    }));
  }

  private approvalPermission(stage: NotificationStage): string {
    return stage === 'PLAN' ? 'bsc.plan.approve.subordinate' : 'bsc.evaluation.approve.subordinate';
  }

  private async directorRecipientIds(
    db: Prisma.TransactionClient,
    departmentId: string,
    ownerId: string,
    permission: string,
  ): Promise<string[]> {
    const now = new Date();
    const directors = await db.users.findMany({
      where: {
        id: { not: ownerId },
        status: 'ACTIVE',
        deleted_at: null,
        departments: { status: 'ACTIVE' },
        positions: { status: 'ACTIVE' },
        user_roles_user_roles_user_idTousers: {
          some: {
            AND: [
              { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
              {
                OR: [
                  { scope_type: 'GLOBAL' },
                  { scope_type: 'DEPARTMENT', scope_id: departmentId },
                ],
              },
            ],
            roles: {
              code: 'DIRECTOR',
              status: 'ACTIVE',
              role_permissions: { some: { permissions: { code: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    return directors.map((director) => director.id);
  }

  private async employeeReopenDrafts(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft[]> {
    const request = await db.bsc_unlock_requests.findUnique({
      where: { id: event.resourceId },
      select: { id: true, employee_bsc_id: true, stage: true, requested_by: true },
    });
    if (!request) this.sourceNotFound();
    const bsc = await db.employee_bsc.findUnique({
      where: { id: request.employee_bsc_id },
      select: { id: true, bsc_code: true, employee_id: true, department_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const requested = event.type.endsWith('_REQUESTED');
    const recipientIds = requested
      ? await this.directorRecipientIds(db, bsc.department_id, bsc.employee_id, 'bsc.reopen.subordinate')
      : [request.requested_by];
    const owner = await db.users.findUnique({ where: { id: bsc.employee_id }, select: { full_name: true } });
    const action = requested ? 'REQUESTED' : event.type.endsWith('_APPROVED') ? 'APPROVED' : 'REJECTED';
    return recipientIds.map((recipientId) => ({
      recipientId,
      ...this.reopenCopy(request.stage as NotificationStage, action, 'cá nhân', owner?.full_name ?? bsc.bsc_code),
      entityType: 'employee_bsc',
      entityId: bsc.id,
      targetPath: requested
        ? `/management/bsc-reopen-requests?stage=${request.stage}`
        : `/employee-bsc/${bsc.id}`,
      metadata: { stage: request.stage, action, bscId: bsc.id, reopenRequestId: request.id },
    }));
  }

  private async departmentBscDraft(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft> {
    const bsc = await db.department_bsc.findUnique({
      where: { id: event.resourceId },
      select: { id: true, department_id: true, responsible_manager_id: true, reviewer_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const department = await db.departments.findUnique({ where: { id: bsc.department_id }, select: { name: true } });
    const submitted = event.type.endsWith('_SUBMITTED');
    const { stage, action } = this.stageAction(event.type);
    return {
      recipientId: submitted ? bsc.reviewer_id : bsc.responsible_manager_id,
      ...this.copy(stage, action, 'phòng ban', department?.name ?? 'phòng ban'),
      entityType: 'department_bsc',
      entityId: bsc.id,
      targetPath: `/department-bsc/${bsc.id}`,
      metadata: { stage, action, departmentBscId: bsc.id },
    };
  }

  private async departmentReopenDraft(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft> {
    const request = await db.department_bsc_unlock_requests.findUnique({
      where: { id: event.resourceId },
      select: { id: true, department_bsc_id: true, stage: true, requested_by: true, reviewer_id: true },
    });
    if (!request) this.sourceNotFound();
    const bsc = await db.department_bsc.findUnique({
      where: { id: request.department_bsc_id },
      select: { id: true, department_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const department = await db.departments.findUnique({ where: { id: bsc.department_id }, select: { name: true } });
    const requested = event.type.endsWith('_REQUESTED');
    const action = requested ? 'REQUESTED' : event.type.endsWith('_APPROVED') ? 'APPROVED' : 'REJECTED';
    return {
      recipientId: requested ? request.reviewer_id : request.requested_by,
      ...this.reopenCopy(request.stage as NotificationStage, action, 'phòng ban', department?.name ?? 'phòng ban'),
      entityType: 'department_bsc',
      entityId: bsc.id,
      targetPath: requested
        ? '/management/department-bsc-reviews?stage=REOPEN'
        : `/department-bsc/${bsc.id}`,
      metadata: { stage: request.stage, action, departmentBscId: bsc.id, reopenRequestId: request.id },
    };
  }

  private stageAction(type: NotificationEventType) {
    const stage: NotificationStage = type.includes('_PLAN_') ? 'PLAN' : 'EVALUATION';
    const action = type.endsWith('_SUBMITTED') ? 'SUBMITTED' : type.endsWith('_APPROVED') ? 'APPROVED' : 'RETURNED';
    return { stage, action };
  }

  private copy(stage: NotificationStage, action: string, scope: string, subject: string) {
    const stageLabel = this.stageLabel(stage);
    if (action === 'SUBMITTED') return {
      title: `BSC ${scope} chờ duyệt`,
      message: `${subject} đã nộp ${stageLabel} BSC và đang chờ bạn xem xét.`,
    };
    if (action === 'APPROVED') return {
      title: `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} BSC đã được duyệt`,
      message: `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} BSC của ${subject} đã được duyệt.`,
    };
    return {
      title: `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} BSC được trả lại`,
      message: `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} BSC của ${subject} cần được chỉnh sửa và nộp lại.`,
    };
  }

  private reopenCopy(stage: NotificationStage, action: string, scope: string, subject: string) {
    const stageLabel = this.stageLabel(stage);
    if (action === 'REQUESTED') return {
      title: `Yêu cầu mở lại BSC ${scope}`,
      message: `${subject} đã gửi yêu cầu mở lại ${stageLabel} BSC.`,
    };
    if (action === 'APPROVED') return {
      title: 'Yêu cầu mở lại BSC đã được chấp thuận',
      message: `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} BSC của ${subject} đã được mở lại.`,
    };
    return {
      title: 'Yêu cầu mở lại BSC bị từ chối',
      message: `Yêu cầu mở lại ${stageLabel} BSC của ${subject} không được chấp thuận.`,
    };
  }

  private sourceNotFound(): never {
    throw new NotFoundException({
      code: 'NOTIFICATION_SOURCE_NOT_FOUND',
      message: 'Không tìm thấy dữ liệu nguồn để tạo thông báo.',
    });
  }

  private stageLabel(stage: NotificationStage): string {
    return stage === 'PLAN' ? 'kế hoạch' : 'đánh giá';
  }
}
