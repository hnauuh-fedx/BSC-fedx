export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  module: string;
  entityType: string;
  entityId: string | null;
  action: string;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
}

export interface AuditLogQuery {
  from?: string;
  to?: string;
  module?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}
