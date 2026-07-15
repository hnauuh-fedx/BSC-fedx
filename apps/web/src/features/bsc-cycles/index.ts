import { httpClient } from '../../lib/http-client';

export type BscCycle = {
  id: string;
  name: string;
  year: number;
  month: number | null;
  status: string;
  startDate: string;
  endDate: string;
};

export const bscCyclesApi = {
  open: () => httpClient.get<BscCycle[]>('/bsc-cycles/open'),
  detail: (id: string) => httpClient.get<BscCycle>(`/bsc-cycles/${id}`),
};
