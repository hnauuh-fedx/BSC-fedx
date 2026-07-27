import { httpClient } from '../../lib/http-client';
import { DashboardData, ReportOptions, ReportPage, ReportSummary } from './reports.types';

export const reportQuery = (input: Record<string, string | number | undefined>) => {
  const value = new URLSearchParams(Object.entries(input).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => [key, String(item)]));
  const encoded = value.toString(); return encoded ? `?${encoded}` : '';
};
export const reportsApi = {
  dashboard: (params: Record<string, string | number | undefined> = {}) => httpClient.get<DashboardData>(`/bsc-reports/dashboard${reportQuery(params)}`),
  summary: (params: Record<string, string | number | undefined>) => httpClient.get<ReportSummary>(`/bsc-reports/summary${reportQuery(params)}`),
  list: (params: Record<string, string | number | undefined>) => httpClient.get<ReportPage>(`/bsc-reports${reportQuery(params)}`),
  options: (params: Record<string, string | number | undefined> = {}) => httpClient.get<ReportOptions>(`/bsc-reports/options${reportQuery(params)}`),
  export: (params: Record<string, string | number | undefined>) => httpClient.download(`/bsc-reports/export${reportQuery(params)}`),
};
