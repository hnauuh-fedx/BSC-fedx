import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { BscMinutesPrintDocument } from '../../src/features/bsc-minutes/components/bsc-minutes-print-document';
import { exportMinutesToPdf } from '../../src/features/bsc-minutes/bsc-minutes-pdf';

const names = ['Phạm Như Huỳnh', 'Bùi Thị Ngọc Trinh', 'Trương Thị Bích Duyên', 'Ngô Thị Thùy Duy', 'Lâm Thị Ngọc Yến', 'Châu Thị Hồng Trúc'];
const rows = Array.from({ length: 25 }, (_, index) => ({
  id: `row-${index + 1}`,
  employeeName: index === 13 ? 'Lê Trúc Nhi' : names[index % names.length],
  departmentId: index < 8 ? 'cskh' : index < 10 ? 'kt' : 'mkt',
  departmentName: index < 8 ? 'Chăm sóc khách hàng' : index < 10 ? 'Kế toán' : 'Marketing',
  selfScore: '108', selfGrade: 'A+', unitScore: '108', unitGrade: 'A+', explanation: '',
}));

createRoot(document.getElementById('root')!).render(<main className="bsc-minutes-page">
  <div className="minutes-editor" style={{ height: 2500 }}>Vùng nhập biên bản</div>
  <BscMinutesPrintDocument number="63" issuePlace="Vĩnh Long" date="2026-11-12" startTime="08:00" endTime="10:00"
    location="B11.204" chairName="Hồ Minh Hải" secretaryName="Huỳnh Phương Linh" absentCount="0"
    subject="V/v đánh giá xếp loại viên chức, người lao động tháng 10/2026"
    meetingContent="Họp xét đánh giá xếp loại viên chức, người lao động tháng 10/2026 và giao chỉ tiêu tháng 11/2026."
    nextMonthAssignment="Kèm theo bảng BSC của cá nhân và đơn vị."
    conclusion="Nội dung Biên bản đã được thông qua và các thành viên dự họp thống nhất."
    rows={rows} collectiveRows={[]} />
</main>);

Object.assign(window, {
  exportTestMinutes: () => exportMinutesToPdf(document.querySelector<HTMLElement>('.minutes-print-document')!, 'minutes.pdf'),
});
