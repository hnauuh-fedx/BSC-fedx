import { httpClient } from '../../../lib/http-client';
import { BscItem, BscPage, BscScoringPreview, EmployeeBsc } from '../types/employee-bsc.types';

const query = (input: Record<string, string | number | undefined>) => `?${new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString()}`;
export const employeeBscApi = {
  list: (params: Record<string, string | number | undefined>) => httpClient.get<BscPage>(`/employee-bsc${query(params)}`),
  detail: (id: string) => httpClient.get<EmployeeBsc>(`/employee-bsc/${id}`),
  scoringPreview: (id: string) => httpClient.get<BscScoringPreview>(`/employee-bsc/${id}/scoring-preview`),
  create: (cycleId: string) => httpClient.post<EmployeeBsc>('/employee-bsc', { cycleId }),
  update: (id: string, employeeComment: string) => httpClient.patch<EmployeeBsc>(`/employee-bsc/${id}`, { employeeComment }),
  delete: (id: string) => httpClient.delete<{ success: true }>(`/employee-bsc/${id}`),
  createItem: (bscId: string, data: unknown) => httpClient.post<BscItem>(`/employee-bsc/${bscId}/items`, data),
  updateItem: (bscId: string, itemId: string, data: unknown) => httpClient.patch<BscItem>(`/employee-bsc/${bscId}/items/${itemId}`, data),
  updateActual: (bscId: string, itemId: string, data: unknown) => httpClient.patch<BscItem>(`/employee-bsc/${bscId}/items/${itemId}/actual`, data),
  deleteItem: (bscId: string, itemId: string) => httpClient.delete<{ success: true }>(`/employee-bsc/${bscId}/items/${itemId}`),
};
