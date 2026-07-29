import { BSC_CLASSIFICATIONS } from '../employee-bsc/services/bsc-classification.service';

export const BSC_REPORT_PERMISSIONS = {
  PERSONAL: 'bsc.statistics.personal',
  UNIT: 'bsc.statistics.unit',
  ORGANIZATION: 'bsc.statistics.organization',
  EXPORT: 'bsc.report.export',
} as const;

export const BSC_REPORT_VIEW_PERMISSIONS = [
  BSC_REPORT_PERMISSIONS.PERSONAL,
  BSC_REPORT_PERMISSIONS.UNIT,
  BSC_REPORT_PERMISSIONS.ORGANIZATION,
] as const;

export const BSC_REPORT_EXPORT_LIMIT = 5_000;

export const LEGACY_BSC_REPORT_GRADE = 'A++' as const;
export const BSC_REPORT_GRADES = [...BSC_CLASSIFICATIONS, LEGACY_BSC_REPORT_GRADE] as const;
export const BSC_REPORT_GRADE_OPTIONS = BSC_REPORT_GRADES.map(value => ({
  value,
  label: value === LEGACY_BSC_REPORT_GRADE ? `${value} (dữ liệu cũ)` : value,
  assignable: value !== LEGACY_BSC_REPORT_GRADE,
}));
