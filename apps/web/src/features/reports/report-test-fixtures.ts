import { ReportOptions } from './reports.types';

export const REPORT_GRADE_OPTIONS = [
  { value: 'D', label: 'D', assignable: true },
  { value: 'C', label: 'C', assignable: true },
  { value: 'B', label: 'B', assignable: true },
  { value: 'A', label: 'A', assignable: true },
  { value: 'A+', label: 'A+', assignable: true },
  { value: 'A++', label: 'A++ (dữ liệu cũ)', assignable: false },
] satisfies ReportOptions['grades'];
