import { httpClient } from '../../lib/http-client';
import type { BscMinutes, BscMinutesPage, SaveBscMinutesInput } from './bsc-minutes.types';

const query = (params: Record<string, string | number | undefined>) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => [key, String(item)])).toString();
  return value ? `?${value}` : '';
};

export const bscMinutesApi = {
  list: (params: Record<string, string | number | undefined> = {}) => httpClient.get<BscMinutesPage>(`/bsc-minutes${query(params)}`),
  detail: (id: string) => httpClient.get<BscMinutes>(`/bsc-minutes/${id}`),
  create: (input: SaveBscMinutesInput) => httpClient.post<BscMinutes>('/bsc-minutes', input),
  update: (id: string, input: SaveBscMinutesInput) => httpClient.patch<BscMinutes>(`/bsc-minutes/${id}`, input),
  recordOutput: (id: string, type: 'PRINT' | 'PDF') => httpClient.post<BscMinutes>(`/bsc-minutes/${id}/output`, { type }),
};
