export const BSC_COMMON_GOAL_GROUP_CODE = 'COMMON';
export const BSC_PRIMARY_GOAL_GROUP_CODE = 'UNIT_PROFESSIONAL';

export const BSC_GOAL_GROUPS = [
  { code: BSC_COMMON_GOAL_GROUP_CODE, marker: 'A', name: 'Mục tiêu chung', displayOrder: 1 },
  { code: BSC_PRIMARY_GOAL_GROUP_CODE, marker: 'B', name: 'Mục tiêu chuyên môn của đơn vị', displayOrder: 2 },
  { code: 'IMPORTANT_URGENT', marker: '1', name: 'Nhóm mục tiêu quan trọng và cấp bách', displayOrder: 3 },
  { code: 'IMPORTANT_OR_URGENT', marker: '2', name: 'Nhóm mục tiêu quan trọng/hoặc cấp bách', displayOrder: 4 },
  { code: 'ROUTINE', marker: '3', name: 'Nhóm mục tiêu thường xuyên', displayOrder: 5 },
] as const;

export const BSC_GOAL_GROUP_CODES = BSC_GOAL_GROUPS.map((group) => group.code);
