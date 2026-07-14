import React from 'react';
const labels: Record<string, string> = { DRAFT: 'Nháp', SUBMITTED: 'Đã nộp', RETURNED: 'Trả lại', APPROVED: 'Đã duyệt' };
export const BscStatusBadge: React.FC<{ status: string }> = ({ status }) => <span aria-label={`Trạng thái ${status}`}>{labels[status] ?? status}</span>;
