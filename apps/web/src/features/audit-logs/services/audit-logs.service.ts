import { httpClient } from '../../../lib/http-client';
import type { AuditLogEntry, AuditLogListResponse, AuditLogQuery } from '../types/audit-logs.types';

function buildQueryString(query: AuditLogQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.module) params.set('module', query.module);
  if (query.action) params.set('action', query.action);
  if (query.actorId) params.set('actorId', query.actorId);
  if (query.entityId) params.set('entityId', query.entityId);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const auditLogsApi = {
  /** GET /audit-logs — paginated list with filters */
  list: (query: AuditLogQuery = {}) =>
    httpClient.get<AuditLogListResponse>(`/audit-logs${buildQueryString(query)}`),

  /** GET /audit-logs/:id — detail of a single entry */
  detail: (id: string) => httpClient.get<AuditLogEntry>(`/audit-logs/${id}`),

  /** GET /audit-logs/modules — available modules for filter dropdown */
  modules: () => httpClient.get<string[]>('/audit-logs/modules'),
};
