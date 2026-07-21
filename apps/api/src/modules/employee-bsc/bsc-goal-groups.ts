export const BSC_GOAL_GROUPS = [
  { code: 'COMMON', marker: 'A', name: 'Mục tiêu chung', displayOrder: 1 },
  { code: 'UNIT_PROFESSIONAL', marker: 'B', name: 'Mục tiêu chuyên môn của đơn vị', displayOrder: 2 },
  { code: 'IMPORTANT_URGENT', marker: '1', name: 'Nhóm mục tiêu quan trọng và cấp bách', displayOrder: 3 },
  { code: 'IMPORTANT_OR_URGENT', marker: '2', name: 'Nhóm mục tiêu quan trọng/hoặc cấp bách', displayOrder: 4 },
  { code: 'ROUTINE', marker: '3', name: 'Nhóm mục tiêu thường xuyên', displayOrder: 5 },
] as const;

export const BSC_GOAL_GROUP_CODES = BSC_GOAL_GROUPS.map((group) => group.code);
