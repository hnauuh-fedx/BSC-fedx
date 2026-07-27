const reportScoreFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatReportScore = (value: string | number | null) => {
  if (value === null) return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? reportScoreFormatter.format(numericValue) : '—';
};

export const reportScoreNumber = (value: string | number | null) => {
  if (value === null) return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) / 100 : 0;
};
