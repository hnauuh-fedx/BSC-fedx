import ExcelJS from 'exceljs';
import {
  BSC_COMMON_GOAL_GROUP_CODE,
  BSC_GOAL_GROUPS,
  BSC_PRIMARY_GOAL_GROUP_CODE,
} from '../employee-bsc/bsc-goal-groups';

export type BscWorkbookItem = {
  kpo: string | null; kpi: string; goalGroupCode: string; unit: string; target: string | number | null;
  weight: number; frequency: string; actual: string | number | null; achievement: number | null;
  workScore: number | null; weightedScore: number | null; explanation: string | null; sortOrder: number;
};

export type BscDetailWorkbookInput = {
  sheetName: string; subjectLabel: string; subjectName: string; departmentName: string; positionName?: string | null;
  cycleName: string; cycleYear: number; evaluatorName: string; implementerName: string; totalScore: number | null;
  adjustmentScore?: number | null; finalGrade: string | null; items: BscWorkbookItem[];
};

const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF777777' } }, bottom: { style: 'thin', color: { argb: 'FF777777' } },
  left: { style: 'thin', color: { argb: 'FF777777' } }, right: { style: 'thin', color: { argb: 'FF777777' } },
};

export async function buildBscDetailWorkbook(input: BscDetailWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BSC Management'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.properties.defaultRowHeight = 20;
  sheet.mergeCells('A1:L1'); sheet.getCell('A1').value = 'BẢNG GIAO MỤC TIÊU VÀ ĐÁNH GIÁ KẾT QUẢ HOẠT ĐỘNG';
  sheet.mergeCells('A2:L2'); sheet.getCell('A2').value = 'THEO HỆ THỐNG THẺ ĐIỂM CÂN BẰNG (BSC) VÀ KPI';
  const departmentSegment = input.subjectLabel === 'PHÒNG BAN' ? '' : ` - ĐƠN VỊ: ${input.departmentName}`;
  sheet.mergeCells('A3:L3'); sheet.getCell('A3').value = `${input.subjectLabel}: ${input.subjectName}${input.positionName ? ` - CHỨC DANH: ${input.positionName}` : ''}${departmentSegment} - KỲ: ${input.cycleName}`;
  for (let row = 1; row <= 3; row += 1) {
    const cell = sheet.getCell(row, 1); cell.font = { name: 'Arial', bold: true, size: row === 1 ? 13 : 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  sheet.getRow(1).height = 24; sheet.getRow(3).height = 30;

  const headers = ['STT', 'MỤC TIÊU CHIẾN LƯỢC\n(KPO)', 'ĐO LƯỜNG HIỆU SUẤT (KPI)', 'ĐVT', 'CHỈ TIÊU', '% TỶ TRỌNG', 'TẦN SUẤT ĐO', 'K.Q THỰC HIỆN', 'TỈ LỆ HOÀN THÀNH', 'ĐIỂM CÔNG VIỆC', 'ĐIỂM TRỌNG SỐ', 'THUYẾT MINH KẾT QUẢ THỰC HIỆN'];
  const header = sheet.getRow(5); header.values = headers; header.height = 62;
  header.eachCell(cell => { cell.font = { name: 'Arial', bold: true, size: 9 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CAF5' } }; cell.border = border; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });

  let rowNumber = 6;
  for (const group of BSC_GOAL_GROUPS) {
    const groupItems = input.items.filter(item => item.goalGroupCode === group.code).sort((a, b) => a.sortOrder - b.sortOrder);
    const weightItems = group.code === BSC_PRIMARY_GOAL_GROUP_CODE
      ? input.items.filter(item => item.goalGroupCode !== BSC_COMMON_GOAL_GROUP_CODE)
      : groupItems;
    const groupRow = sheet.getRow(rowNumber++); groupRow.values = [group.marker, group.name, '', '', '', weightItems.reduce((sum, item) => sum + item.weight, 0), '', '', '', '', '', ''];
    groupRow.height = 25; groupRow.eachCell(cell => { cell.font = { name: 'Arial', bold: true, size: 9 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: group.marker === 'A' || group.marker === 'B' ? 'FFFFFF00' : 'FFF8CBAD' } }; cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; });
    groupRow.getCell(6).numFmt = '0.##"%"'; groupRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    groupItems.forEach((item, index) => {
      const row = sheet.getRow(rowNumber++); row.values = [index + 1, item.kpo, item.kpi, item.unit, item.target, item.weight, item.frequency, item.actual, item.achievement, item.workScore, item.weightedScore, item.explanation];
      row.height = 45; row.eachCell((cell, column) => { cell.font = { name: 'Arial', size: 9 }; cell.border = border; cell.alignment = { horizontal: column === 2 || column === 3 || column === 12 ? 'left' : 'center', vertical: 'middle', wrapText: true }; });
      row.getCell(6).numFmt = '0.##"%"';
      for (const column of [9, 10, 11]) row.getCell(column).numFmt = '0.##';
    });
  }

  const totalRow = rowNumber++; const adjustmentRow = rowNumber++; const gradeRow = rowNumber++;
  for (const [row, label, value] of [[totalRow, 'ĐIỂM ĐÁNH GIÁ', input.totalScore ?? 'Chưa đủ dữ liệu'], [adjustmentRow, 'ĐIỂM PHÁT SINH TRONG KỲ (-10 - 10%)', input.adjustmentScore ?? 'Chưa áp dụng'], [gradeRow, 'LOẠI THÀNH TÍCH', input.finalGrade ?? 'Chưa đủ dữ liệu']] as const) {
    sheet.mergeCells(row, 1, row, 7); sheet.mergeCells(row, 8, row, 12); sheet.getCell(row, 1).value = label; sheet.getCell(row, 8).value = value;
    for (const cell of [sheet.getCell(row, 1), sheet.getCell(row, 8)]) { cell.font = { name: 'Arial', bold: true, size: 10 }; cell.border = border; cell.alignment = { vertical: 'middle' }; }
    sheet.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle' }; sheet.getCell(row, 8).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  sheet.mergeCells(rowNumber, 8, rowNumber, 12); sheet.getCell(rowNumber, 8).value = `Ngày ..... tháng ..... năm ${input.cycleYear}`; sheet.getCell(rowNumber, 8).alignment = { horizontal: 'center' };
  sheet.mergeCells(rowNumber + 1, 1, rowNumber + 1, 6); sheet.mergeCells(rowNumber + 1, 7, rowNumber + 1, 12);
  sheet.getCell(rowNumber + 1, 1).value = 'NGƯỜI ĐÁNH GIÁ'; sheet.getCell(rowNumber + 1, 7).value = 'NGƯỜI THỰC HIỆN';
  sheet.mergeCells(rowNumber + 5, 1, rowNumber + 5, 6); sheet.mergeCells(rowNumber + 5, 7, rowNumber + 5, 12);
  sheet.getCell(rowNumber + 5, 1).value = input.evaluatorName; sheet.getCell(rowNumber + 5, 7).value = input.implementerName;
  for (const cell of [sheet.getCell(rowNumber + 1, 1), sheet.getCell(rowNumber + 1, 7), sheet.getCell(rowNumber + 5, 1), sheet.getCell(rowNumber + 5, 7)]) { cell.font = { name: 'Arial', bold: true, size: 10 }; cell.alignment = { horizontal: 'center' }; }
  sheet.columns = [6, 28, 36, 9, 12, 11, 12, 13, 13, 12, 12, 28].map(width => ({ width }));
  sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.1, footer: 0.1 };
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
