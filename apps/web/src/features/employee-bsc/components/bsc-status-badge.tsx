import React from 'react';

const labels: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu', DRAFT: 'Nháp', SUBMITTED: 'Chờ duyệt', RETURNED: 'Bị trả lại',
  APPROVED: 'Đã duyệt', REOPENED: 'Được mở lại', PENDING: 'Chờ xử lý', REJECTED: 'Từ chối', EXPIRED: 'Đã hết hiệu lực',
};

export const BscStatusBadge: React.FC<{ status: string }> = ({ status }) => <span aria-label={`Trạng thái ${labels[status] ?? 'không xác định'}`} className={`status-badge status-${status.toLowerCase()}`}><span aria-hidden="true" className="status-dot"/>{labels[status] ?? 'Không xác định'}</span>;
