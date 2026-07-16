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
