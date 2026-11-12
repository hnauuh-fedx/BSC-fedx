import React from 'react';
import { createRoot } from 'react-dom/client';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import '../../src/index.css';
import { BscMinutesPrintDocument, type MinutesPrintDocumentProps } from '../../src/features/bsc-minutes/components/bsc-minutes-print-document';
import { exportMinutesToPdf } from '../../src/features/bsc-minutes/bsc-minutes-pdf';

GlobalWorkerOptions.workerSrc = workerUrl;
const names = [
  'Cao Huỳnh Hoa', 'Nguyễn Tường Vi', 'Phạm Như Huỳnh', 'Bùi Thị Ngọc Trinh', 'Trương Thị Bích Duyên',
  'Ngô Thị Thùy Duy', 'Lâm Thị Ngọc Yến', 'Châu Thị Hồng Trúc', 'Lương Thị Thúy', 'Huỳnh Phương Linh',
  'Kim Thị Quế Chi', 'Hà Phong Tài', 'Nguyễn Thị Hồng', 'Lê Trúc Nhi', 'Lâm Ngọc Diệp',
  'Nguyễn Thúy Phượng', 'Nguyễn Thị Huỳnh Như', 'Nguyễn Thị Yến Linh', 'Nguyễn Hữu Anh', 'Trần Châu Bá An',
  'Nguyễn Huỳnh Chí', 'Huỳnh Bảo Yến', 'Trần Huỳnh Quế Anh', 'Nguyễn Chí Dĩ', 'Dương Thị Thùy Trang',
];
const params = new URLSearchParams(location.search);
const explanation = params.has('long') ? Array.from({ length: 90 }, (_, i) => `Mục ${i + 1}: hoàn thành công việc và phối hợp xử lý yêu cầu.`).join(' ') : '';
const rows = Array.from({ length: Number(params.get('rows') || 25) }, (_, index) => ({
  id: `row-${index + 1}`, employeeName: names[index] || `Nhân viên thử nghiệm ${index + 1}`,
  departmentId: index < 8 ? 'cskh' : index < 10 ? 'kt' : 'mkt',
  departmentName: index < 8 ? 'Chăm sóc khách hàng' : index < 10 ? 'Kế toán' : 'Marketing',
  selfScore: '108', selfGrade: 'A+', unitScore: '108', unitGrade: 'A+', explanation: index === 16 ? explanation : '',
}));
const props: MinutesPrintDocumentProps = {
  number: '63', issuePlace: 'Vĩnh Long', date: '2026-11-12', startTime: '08:00', endTime: '10:00',
  location: 'B11.204', chairName: 'Hồ Minh Hải', secretaryName: 'Huỳnh Phương Linh', absentCount: '0',
  subject: 'V/v đánh giá xếp loại viên chức, người lao động tháng 10/2026',
  meetingContent: 'Họp xét đánh giá xếp loại viên chức, người lao động tháng 10/2026 và giao chỉ tiêu tháng 11/2026.',
  nextMonthAssignment: 'Kèm theo bảng BSC của cá nhân và đơn vị.',
  conclusion: 'Nội dung Biên bản đã được thông qua và các thành viên dự họp thống nhất.', rows, collectiveRows: [],
};
createRoot(document.getElementById('root')!).render(<main className="bsc-minutes-page">
  <div className="minutes-editor" style={{ height: 2500 }}>Vùng nhập biên bản</div>
  <BscMinutesPrintDocument {...props} />
</main>);

Object.assign(window, {
  minutesTestProps: props,
  exportTestMinutes: () => exportMinutesToPdf(props, 'minutes.pdf'),
  readSavedPdf: async (bytes: number[], render = false) => {
    const task = getDocument({ data: new Uint8Array(bytes) });
    const pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item).map((item) => {
        if (!('str' in item)) throw new Error('Unexpected PDF text item');
        return { text: item.str, x: item.transform[4], baseline: item.transform[5], height: item.height, width: item.width, fontName: item.fontName };
      });
      let image;
      if (render) {
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        image = canvas.toDataURL('image/png');
      }
      pages.push({ width: page.view[2], height: page.view[3], items, image });
    }
    await task.destroy();
    return pages;
  },
});
