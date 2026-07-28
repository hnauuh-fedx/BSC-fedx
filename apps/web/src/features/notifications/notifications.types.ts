export interface NotificationActor {
  id: string;
  fullName: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: 'employee_bsc' | 'department_bsc';
  entityId: string;
  targetPath: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationQuery {
  cursor?: string | null;
  limit?: number;
  unreadOnly?: boolean;
}

