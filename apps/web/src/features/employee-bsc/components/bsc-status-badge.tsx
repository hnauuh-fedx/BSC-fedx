import React from 'react';

const labels: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  DRAFT: 'Nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Bị trả lại',
  APPROVED: 'Đã duyệt',
  REOPENED: 'Được mở lại',
  PENDING: 'Chờ xử lý',
  REJECTED: 'Từ chối',
};

export const BscStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span aria-label={`Trạng thái ${status}`}>{labels[status] ?? status}</span>
);
