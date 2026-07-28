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
    const draft = await this.resolveDraft(db, event);
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
  }

  private async resolveDraft(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft> {
    if (EMPLOYEE_EVENTS.has(event.type)) return this.employeeBscDraft(db, event);
    if (EMPLOYEE_REOPEN_EVENTS.has(event.type)) return this.employeeReopenDraft(db, event);
    if (DEPARTMENT_EVENTS.has(event.type)) return this.departmentBscDraft(db, event);
    return this.departmentReopenDraft(db, event);
  }

  private async employeeBscDraft(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft> {
    const bsc = await db.employee_bsc.findUnique({
      where: { id: event.resourceId },
      select: { id: true, bsc_code: true, employee_id: true, direct_manager_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const submitted = event.type.endsWith('_SUBMITTED');
    const recipientId = submitted ? bsc.direct_manager_id : bsc.employee_id;
    const owner = await db.users.findUnique({ where: { id: bsc.employee_id }, select: { full_name: true } });
    const { stage, action } = this.stageAction(event.type);
    return {
      recipientId,
      ...this.copy(stage, action, 'cá nhân', owner?.full_name ?? bsc.bsc_code),
      entityType: 'employee_bsc',
      entityId: bsc.id,
      targetPath: `/employee-bsc/${bsc.id}`,
      metadata: { stage, action, bscId: bsc.id },
    };
  }

  private async employeeReopenDraft(db: Prisma.TransactionClient, event: NotificationEvent): Promise<NotificationDraft> {
    const request = await db.bsc_unlock_requests.findUnique({
      where: { id: event.resourceId },
      select: { id: true, employee_bsc_id: true, stage: true, requested_by: true, reviewer_id: true },
    });
    if (!request) this.sourceNotFound();
    const bsc = await db.employee_bsc.findUnique({
      where: { id: request.employee_bsc_id },
      select: { id: true, bsc_code: true, employee_id: true },
    });
    if (!bsc) this.sourceNotFound();
    const requested = event.type.endsWith('_REQUESTED');
    const recipientId = requested ? request.reviewer_id : request.requested_by;
    if (!recipientId) this.sourceNotFound();
    const owner = await db.users.findUnique({ where: { id: bsc.employee_id }, select: { full_name: true } });
    const action = requested ? 'REQUESTED' : event.type.endsWith('_APPROVED') ? 'APPROVED' : 'REJECTED';
    return {
      recipientId,
      ...this.reopenCopy(request.stage as NotificationStage, action, 'cá nhân', owner?.full_name ?? bsc.bsc_code),
      entityType: 'employee_bsc',
      entityId: bsc.id,
      targetPath: requested
        ? `/management/bsc-reopen-requests?stage=${request.stage}`
        : `/employee-bsc/${bsc.id}`,
      metadata: { stage: request.stage, action, bscId: bsc.id, reopenRequestId: request.id },
    };
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
    const stageLabel = stage === 'PLAN' ? 'kế hoạch' : 'kết quả đánh giá';
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
    const stageLabel = stage === 'PLAN' ? 'kế hoạch' : 'kết quả đánh giá';
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
}
