import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { buildBscDetailWorkbook } from '../src/modules/reports/bsc-detail-workbook';

test('single BSC workbook follows the approved layout and contains no logo', async () => {
  const bytes = await buildBscDetailWorkbook({
    sheetName: 'BSC cá nhân', subjectLabel: 'HỌ VÀ TÊN', subjectName: 'Phạm Bùi Nhựt Minh', departmentName: 'Marketing',
    positionName: 'Nhân viên', cycleName: 'Tháng 6/2026', cycleYear: 2026, evaluatorName: 'Hồ Minh Hải',
    implementerName: 'Phạm Bùi Nhựt Minh', totalScore: 104, finalGrade: 'A+', items: [{
      kpo: 'Thực hiện đúng phân công', kpi: 'Hoàn thành yêu cầu', goalGroupCode: 'COMMON', unit: '%', target: 100,
      weight: 5, frequency: 'Tháng', actual: 100, achievement: 100, workScore: 100, weightedScore: 5,
      explanation: 'Hoàn thành', sortOrder: 1,
    }],
  });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('BSC cá nhân'); assert.ok(sheet);
  assert.equal(sheet.getImages().length, 0);
  assert.equal(sheet.getCell('A1').value, 'BẢNG GIAO MỤC TIÊU VÀ ĐÁNH GIÁ KẾT QUẢ HOẠT ĐỘNG');
  assert.deepEqual(sheet.getRow(5).values.slice(1), ['STT', 'MỤC TIÊU CHIẾN LƯỢC\n(KPO)', 'ĐO LƯỜNG HIỆU SUẤT (KPI)', 'ĐVT', 'CHỈ TIÊU', '% TỶ TRỌNG', 'TẦN SUẤT ĐO', 'K.Q THỰC HIỆN', 'TỈ LỆ HOÀN THÀNH', 'ĐIỂM CÔNG VIỆC', 'ĐIỂM TRỌNG SỐ', 'THUYẾT MINH KẾT QUẢ THỰC HIỆN']);
  assert.equal(sheet.getCell('A6').value, 'A'); assert.equal(sheet.getCell('F6').value, 5);
  assert.equal(sheet.getCell('B7').value, 'Thực hiện đúng phân công'); assert.equal(sheet.getCell('K7').value, 5);
  assert.deepEqual(['A6', 'A8', 'A9', 'A10', 'A11'].map(address => sheet.getCell(address).value), ['A', 'B', '1', '2', '3']);
  assert.equal(sheet.getCell('A12').value, 'ĐIỂM ĐÁNH GIÁ'); assert.equal(sheet.getCell('H12').value, 104);
  assert.equal(sheet.getCell('H13').value, 'Chưa áp dụng'); assert.equal(sheet.getCell('H14').value, 'A+');
  assert.equal(sheet.getCell('A20').value, 'Hồ Minh Hải'); assert.equal(sheet.getCell('G20').value, 'Phạm Bùi Nhựt Minh');
  assert.equal(sheet.pageSetup.orientation, 'landscape'); assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.ok(sheet.getColumn(3).width && sheet.getColumn(3).width! >= 30);
});

test('incomplete BSC workbook leaves evaluation and evaluator unresolved', async () => {
  const bytes = await buildBscDetailWorkbook({ sheetName: 'BSC phòng ban', subjectLabel: 'PHÒNG BAN', subjectName: 'Marketing',
    departmentName: 'Marketing', cycleName: 'Tháng 7/2026', cycleYear: 2026, evaluatorName: '', implementerName: 'Trưởng phòng',
    totalScore: null, finalGrade: null, items: [] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes); const sheet = workbook.getWorksheet('BSC phòng ban'); assert.ok(sheet);
  assert.equal(sheet.getCell('A3').value, 'PHÒNG BAN: Marketing - KỲ: Tháng 7/2026');
  assert.equal(sheet.getCell('H11').value, 'Chưa đủ dữ liệu'); assert.equal(sheet.getCell('H12').value, 'Chưa áp dụng');
  assert.equal(sheet.getCell('A19').value, ''); assert.equal(sheet.getCell('G19').value, 'Trưởng phòng');
});
