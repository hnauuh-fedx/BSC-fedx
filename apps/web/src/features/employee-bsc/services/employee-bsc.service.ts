import { httpClient } from '../../../lib/http-client';
import { BscDuplicateOptions, BscItem, BscPage, BscReopenPage, BscReopenRequest, BscScoringPreview, BscVersionDetail, BscVersionSummary, EmployeeBsc } from '../types/employee-bsc.types';

const query = (input: Record<string, string | number | undefined>) => `?${new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString()}`;
export const employeeBscApi = {
  list: (params: Record<string, string | number | undefined>) => httpClient.get<BscPage>(`/employee-bsc${query(params)}`),
  detail: (id: string) => httpClient.get<EmployeeBsc>(`/employee-bsc/${id}`),
  scoringPreview: (id: string) => httpClient.get<BscScoringPreview>(`/employee-bsc/${id}/scoring-preview`),
  pendingReview: (params: Record<string, string | number | undefined>) => httpClient.get<BscPage>(`/employee-bsc/pending-review${query(params)}`),
  versions: (id: string) => httpClient.get<BscVersionSummary[]>(`/employee-bsc/${id}/versions`),
  version: (id: string, versionId: string) => httpClient.get<BscVersionDetail>(`/employee-bsc/${id}/versions/${versionId}`),
  reopenRequests: (id: string) => httpClient.get<BscReopenRequest[]>(`/employee-bsc/${id}/reopen-requests`),
  requestReopen: (id: string, stage: 'PLAN' | 'EVALUATION', reason: string) => httpClient.post<BscReopenRequest>(`/employee-bsc/${id}/reopen-requests`, { stage, reason }),
  pendingReopenRequests: (params: Record<string, string | number | undefined>) => httpClient.get<BscReopenPage>(`/employee-bsc/reopen-requests/pending${query(params)}`),
  reopenRequest: (requestId: string) => httpClient.get<BscReopenRequest>(`/employee-bsc/reopen-requests/${requestId}`),
  approveReopen: (requestId: string) => httpClient.post<BscReopenRequest>(`/employee-bsc/reopen-requests/${requestId}/approve`, {}),
  rejectReopen: (requestId: string, reason: string) => httpClient.post<BscReopenRequest>(`/employee-bsc/reopen-requests/${requestId}/reject`, { reason }),
  duplicateOptions: (id: string) => httpClient.get<BscDuplicateOptions>(`/employee-bsc/${id}/duplicate-options`),
  duplicate: (id: string, targetCycleId: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/duplicate`, { targetCycleId }),
  create: (cycleId: string) => httpClient.post<EmployeeBsc>('/employee-bsc', { cycleId }),
  update: (id: string, employeeComment: string) => httpClient.patch<EmployeeBsc>(`/employee-bsc/${id}`, { employeeComment }),
  delete: (id: string) => httpClient.delete<{ success: true }>(`/employee-bsc/${id}`),
  submitPlan: (id: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/plan/submit`, {}),
  approvePlan: (id: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/plan/approve`, {}),
  returnPlan: (id: string, reason: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/plan/return`, { reason }),
  submitEvaluation: (id: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/evaluation/submit`, {}),
  approveEvaluation: (id: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/evaluation/approve`, {}),
  returnEvaluation: (id: string, reason: string) => httpClient.post<EmployeeBsc>(`/employee-bsc/${id}/evaluation/return`, { reason }),
  createItem: (bscId: string, data: unknown) => httpClient.post<BscItem>(`/employee-bsc/${bscId}/items`, data),
  updateItem: (bscId: string, itemId: string, data: unknown) => httpClient.patch<BscItem>(`/employee-bsc/${bscId}/items/${itemId}`, data),
  updateActual: (bscId: string, itemId: string, data: unknown) => httpClient.patch<BscItem>(`/employee-bsc/${bscId}/items/${itemId}/actual`, data),
  deleteItem: (bscId: string, itemId: string) => httpClient.delete<{ success: true }>(`/employee-bsc/${bscId}/items/${itemId}`),
};
