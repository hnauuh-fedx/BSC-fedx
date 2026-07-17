import { httpClient } from '../../lib/http-client';

export type CycleType = 'MONTH';
export type CycleStatus = 'DRAFT' | 'OPEN' | 'LOCKED' | 'CLOSED';
export type BscCycleSummary = {
  totalBsc: number; notCreated: number; draft: number; planSubmitted: number; planReturned: number;
  planApproved: number; evaluating: number; evaluationSubmitted: number; evaluationReturned: number; evaluationApproved: number;
};
export type BscCycle = {
  id: string; code: string; name: string; cycleType: CycleType; year: number; month: number | null; quarter: number | null;
  status: CycleStatus; version: number; startDate: string; endDate: string | null;
  createdAt: string; updatedAt: string;
  createdBy?: { id: string; employeeCode: string; fullName: string }; summary?: BscCycleSummary;
};
export type CyclePayload = {
  code: string; name: string; cycleType: CycleType; year: number; month: number;
  startDate: string;
};
export type CyclePage = { items: BscCycle[]; page: number; limit: number; total: number };

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  return params.toString();
};

export const bscCyclesApi = {
  list: (filters: Record<string, string | number | undefined>) => httpClient.get<CyclePage>(`/bsc-cycles?${query(filters)}`),
  open: () => httpClient.get<BscCycle[]>('/bsc-cycles/open'),
  detail: (id: string) => httpClient.get<BscCycle>(`/bsc-cycles/${id}`),
  create: (payload: CyclePayload) => httpClient.post<BscCycle>('/bsc-cycles', payload),
  update: (id: string, payload: Partial<CyclePayload> & { expectedVersion: number }) => httpClient.patch<BscCycle>(`/bsc-cycles/${id}`, payload),
  transition: (id: string, action: 'open' | 'lock' | 'close', expectedVersion: number, reason?: string) =>
    httpClient.post<BscCycle>(`/bsc-cycles/${id}/${action}`, { expectedVersion, ...(reason ? { reason } : {}) }),
};

export { BscCycleDetailPage, BscCycleFormPage, BscCyclesPage } from './pages/bsc-cycle-pages';
