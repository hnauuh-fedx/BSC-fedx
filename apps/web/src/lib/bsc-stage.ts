export const BSC_STAGE_LABELS = {
  PLAN: 'Kế hoạch',
  EVALUATION: 'Đánh giá',
  FULL: 'Toàn bộ BSC',
} as const;

export type BscStage = keyof typeof BSC_STAGE_LABELS;

export const bscStageLabel = (stage: string): string =>
  BSC_STAGE_LABELS[stage as BscStage] ?? stage;
