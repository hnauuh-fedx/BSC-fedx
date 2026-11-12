import type { jsPDF } from 'jspdf';
import type { RowInput, UserOptions } from 'jspdf-autotable';
import type { MinutesPrintDocumentProps } from './components/bsc-minutes-print-document';
import { groupMinutesRows } from './group-minutes-rows';
import regularUrl from './fonts/NotoSerif-Regular.ttf?url';
import boldUrl from './fonts/NotoSerif-Bold.ttf?url';
import italicUrl from './fonts/NotoSerif-Italic.ttf?url';
import boldItalicUrl from './fonts/NotoSerif-BoldItalic.ttf?url';

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
let fonts: Promise<Array<{ style: FontStyle; data: string }>> | undefined;
const loadFonts = () => fonts ??= Promise.all(([
  ['normal', regularUrl], ['bold', boldUrl], ['italic', italicUrl], ['bolditalic', boldItalicUrl],
] as const).map(async ([style, url]) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không thể tải font tiếng Việt cho PDF. Vui lòng thử lại.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return { style, data: btoa(binary) };
})).catch((error) => { fonts = undefined; throw error; });

const longTime = (value: string) => {
  const [hour, minute] = value.split(':');
  return hour && minute !== undefined ? `${Number(hour)} giờ ${minute.padStart(2, '0')} phút` : value;
};

// Text and table cells are written directly to PDF. No DOM measurement or bitmap cropping.
export const buildMinutesPdf = async (props: MinutesPrintDocumentProps): Promise<jsPDF> => {
  const [{ jsPDF }, { autoTable }, fontData] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadFonts()]);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm', putOnlyUsedFonts: true, compress: true });
  for (const { style, data } of fontData) {
    const file = `NotoSerif-${style}.ttf`;
    pdf.addFileToVFS(file, data);
    pdf.addFont(file, 'NotoSerif', style);
  }
  pdf.setProperties({ title: `Biên bản ${props.number} - ${props.subject}`, creator: 'BSC Management' });
  pdf.setLineHeightFactor(1.35);
  pdf.setTextColor(0);
  const left = 20;
  const width = 170;
  const bottom = 277;
  let y = 21;
  const ensureSpace = (height: number) => {
    if (y + height > bottom) { pdf.addPage(); y = 21; }
  };
  const write = (text: string, style: FontStyle = 'normal', gap = 1.5) => {
    pdf.setFont('NotoSerif', style).setFontSize(11);
    const lines = pdf.splitTextToSize(text || ' ', width) as string[];
    for (const line of lines) {
      ensureSpace(5.5);
      pdf.text(line, left, y, { baseline: 'top' });
      y += 5.5;
    }
    y += gap;
  };
  const centered = (text: string, x: number, top: number, size: number, style: FontStyle = 'bold', maxWidth = 83) => {
    pdf.setFont('NotoSerif', style).setFontSize(size);
    const actualSize = Math.min(size, size * maxWidth / Math.max(1, pdf.getTextWidth(text)));
    pdf.setFontSize(actualSize).text(text, x, top, { align: 'center', baseline: 'top' });
  };
  const [year, month, day] = props.date.split('-');
  centered('CÔNG TY TNHH MTV CÔNG NGHỆ FEDX', 62.5, y, 9);
  centered('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 147.5, y, 9);
  centered(`Số: ${props.number || '…'} / BB-FEDX`, 62.5, y + 6, 11, 'normal');
  centered('Độc lập - Tự do - Hạnh phúc', 147.5, y + 5, 10);
  centered(`${props.issuePlace || '……'}, ngày ${Number(day)} tháng ${Number(month)} năm ${year}`, 147.5, y + 12, 10, 'italic');
  y += 25;
  centered('BIÊN BẢN', 105, y, 17);
  y += 10;
  pdf.setFont('NotoSerif', 'normal').setFontSize(11);
  const subject = pdf.splitTextToSize(props.subject, 150) as string[];
  for (const line of subject) { ensureSpace(5.5); centered(line, 105, y, 11, 'normal', 150); y += 5.5; }
  pdf.setLineWidth(0.2).line(85, y + 1, 125, y + 1);
  y += 10;
  write('I. Thời gian, địa điểm:', 'bold');
  write(`- Vào lúc ${longTime(props.startTime)} ngày ${day}/${month}/${year}`);
  write(`- Tại ${props.location || '…………………………………………'}`);
  write('II. Thành phần:', 'bold');
  write(`1. Ông/bà: ${props.chairName || '………………………………'} - Chủ trì;`, 'bolditalic');
  write(`2. Ông/bà: ${props.secretaryName || '………………………………'} - Thư ký;`, 'bolditalic');
  write('Cùng với các viên chức, người lao động đang công tác tại đơn vị.');
  write(`Vắng: ${props.absentCount || '0'}`);
  write(`III. Nội dung: ${props.meetingContent}`);
  ensureSpace(30);
  write('1. Kết quả đánh giá', 'bold');

  const group = (title: string): RowInput => [{ content: title, colSpan: 7, styles: { fontStyle: 'bold', halign: 'left' } }];
  const body: RowInput[] = [group('A. Cá nhân')];
  const departmentHeads = new Map<object, string>();
  const departmentHeadingHeight = 7;
  for (const department of groupMinutesRows(props.rows)) {
    department.rows.forEach((row, index) => {
      const values = [String(department.startIndex + index + 1), row.employeeName, row.selfScore ?? '', row.selfGrade ?? '', row.unitScore, row.unitGrade, row.explanation];
      // Reserve the department title inside its first employee's row, so they move together.
      const cells = index === 0 ? values.map((content) => ({ content, styles: { cellPadding: { top: departmentHeadingHeight + 1.2, bottom: 1.2, left: 1.2, right: 1.2 } } })) : values;
      body.push(cells);
      if (index === 0) departmentHeads.set(cells, department.departmentName);
    });
  }
  body.push(group('B. Tập thể'));
  props.collectiveRows.forEach((row, index) => body.push([
    `B.${index + 1}`, row.departmentName, row.selfScore, row.selfGrade, row.unitScore, row.unitGrade, row.explanation,
  ]));
  const options: UserOptions = {
    startY: y, margin: { top: 20, bottom: 20, left: 20, right: 20 }, tableWidth: width,
    theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: 'NotoSerif', fontStyle: 'normal', fontSize: 10.5, cellPadding: 1.2, lineWidth: 0.2, lineColor: 0, textColor: 0, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fillColor: 255, textColor: 0, halign: 'center' },
    columnStyles: { 0: { cellWidth: 9.35, halign: 'center' }, 1: { cellWidth: 51.85 }, 2: { cellWidth: 15.3 }, 3: { cellWidth: 15.3 }, 4: { cellWidth: 15.3 }, 5: { cellWidth: 15.3 }, 6: { cellWidth: 47.6 } },
    head: [
      [{ content: 'TT', rowSpan: 2 }, { content: 'Họ và tên', rowSpan: 2 }, { content: 'Tự đánh giá', colSpan: 2 }, { content: 'Đơn vị đánh giá', colSpan: 2 }, { content: 'Thuyết minh (nếu tăng hoặc hạ bậc xếp loại)', rowSpan: 2 }],
      ['Điểm', 'Xếp loại', 'Điểm', 'Xếp loại'],
    ],
    body,
    didDrawCell: (data) => {
      const title = departmentHeads.get(data.row.raw);
      if (data.section === 'body' && data.column.index === 6 && title) {
        pdf.setFillColor('#ffffff').setDrawColor('#000000').setLineWidth(0.2);
        pdf.rect(left, data.cell.y, width, departmentHeadingHeight, 'FD');
        pdf.setFont('NotoSerif', 'bold').setFontSize(10.5);
        pdf.text(title, left + 1.2, data.cell.y + 1.2, { baseline: 'top' });
      }
    },
  };
  autoTable(pdf, options);
  y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  ensureSpace(25);
  write(`2. Giao chỉ tiêu tháng tới: ${props.nextMonthAssignment}`);
  write('IV. Kết luận:', 'bold');
  write(props.conclusion || '- Nội dung Biên bản đã được thông qua và các thành viên dự họp thống nhất.');
  write(`Cuộc họp kết thúc lúc ${longTime(props.endTime)} cùng ngày./.`);
  return pdf;
};

export const exportMinutesToPdf = async (props: MinutesPrintDocumentProps, filename: string) => {
  const pdf = await buildMinutesPdf(props);
  pdf.save(filename);
};
