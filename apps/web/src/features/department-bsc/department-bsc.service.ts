import { httpClient } from '../../lib/http-client';
import type { DepartmentBsc, DepartmentBscItem, DepartmentBscPage, DepartmentBscReopenRequest, DepartmentBscScoring, DepartmentBscVersion } from './department-bsc.types';

const query = (input: Record<string, string | number | undefined>) => {
  const value = new URLSearchParams(Object.entries(input).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => [key, String(item)])).toString();
  return value ? `?${value}` : '';
};
export const departmentBscApi = {
  list: (params: Record<string, string | number | undefined> = {}) => httpClient.get<DepartmentBscPage>(`/department-bsc${query(params)}`),
  pendingReview: (params: Record<string, string | number | undefined>) => httpClient.get<DepartmentBscPage>(`/department-bsc/pending-review${query(params)}`),
  detail: (id: string) => httpClient.get<DepartmentBsc>(`/department-bsc/${id}`),
  scoringPreview: (id: string) => httpClient.get<DepartmentBscScoring>(`/department-bsc/${id}/scoring-preview`),
  export: (id: string) => httpClient.download(`/department-bsc/${id}/export`),
  create: (cycleId: string) => httpClient.post<DepartmentBsc>('/department-bsc', { cycleId }),
  update: (id: string, managerComment: string) => httpClient.patch<DepartmentBsc>(`/department-bsc/${id}`, { managerComment }),
  delete: (id: string) => httpClient.delete<{ success: true }>(`/department-bsc/${id}`),
  createItem: (id: string, data: unknown) => httpClient.post<DepartmentBscItem>(`/department-bsc/${id}/items`, data),
  updateItem: (id: string, itemId: string, data: unknown) => httpClient.patch<DepartmentBscItem>(`/department-bsc/${id}/items/${itemId}`, data),
  updateActual: (id: string, itemId: string, data: unknown) => httpClient.patch<DepartmentBscItem>(`/department-bsc/${id}/items/${itemId}/actual`, data),
  deleteItem: (id: string, itemId: string) => httpClient.delete<{ success: true }>(`/department-bsc/${id}/items/${itemId}`),
  submitPlan: (id: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/plan/submit`, {}),
  approvePlan: (id: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/plan/approve`, {}),
  returnPlan: (id: string, reason: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/plan/return`, { reason }),
  submitEvaluation: (id: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/evaluation/submit`, {}),
  approveEvaluation: (id: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/evaluation/approve`, {}),
  returnEvaluation: (id: string, reason: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/evaluation/return`, { reason }),
  duplicate: (id: string, targetCycleId: string) => httpClient.post<DepartmentBsc>(`/department-bsc/${id}/duplicate`, { targetCycleId }),
  versions: (id: string) => httpClient.get<DepartmentBscVersion[]>(`/department-bsc/${id}/versions`),
  requestReopen: (id: string, stage: 'PLAN' | 'EVALUATION', reason: string) => httpClient.post(`/department-bsc/${id}/reopen-requests`, { stage, reason }),
  pendingReopen: () => httpClient.get<DepartmentBscReopenRequest[]>('/department-bsc/reopen-requests/pending'),
  approveReopen: (requestId: string) => httpClient.post<DepartmentBscReopenRequest>(`/department-bsc/reopen-requests/${requestId}/approve`, {}),
  rejectReopen: (requestId: string, reason: string) => httpClient.post<DepartmentBscReopenRequest>(`/department-bsc/reopen-requests/${requestId}/reject`, { reason }),
};

export const DEPARTMENT_BSC_PERMISSIONS = {
  CREATE: 'bsc.department.create', VIEW: 'bsc.department.view', EDIT: 'bsc.department.edit', DELETE_DRAFT: 'bsc.department.delete.draft',
  DUPLICATE: 'bsc.department.duplicate', SUBMIT_PLAN: 'bsc.department.plan.submit', APPROVE_PLAN: 'bsc.department.plan.approve',
  RETURN_PLAN: 'bsc.department.plan.return', SUBMIT_EVALUATION: 'bsc.department.evaluation.submit',
  APPROVE_EVALUATION: 'bsc.department.evaluation.approve', RETURN_EVALUATION: 'bsc.department.evaluation.return',
  REQUEST_REOPEN: 'bsc.department.reopen.request', REVIEW_REOPEN: 'bsc.department.reopen.review', VIEW_VERSION: 'bsc.department.version.view',
  EXPORT: 'bsc.department.report.export',
} as const;
