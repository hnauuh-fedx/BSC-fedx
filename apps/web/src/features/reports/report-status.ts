export const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã nộp / Chờ duyệt',
  RETURNED: 'Trả lại chỉnh sửa',
  APPROVED: 'Đã duyệt',
  REOPENED: 'Được mở lại',
};

export const workflowStatusLabel = (status: string) => WORKFLOW_STATUS_LABELS[status] ?? status;
