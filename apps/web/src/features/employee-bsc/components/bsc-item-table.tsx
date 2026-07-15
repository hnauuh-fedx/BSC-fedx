import React, { useState } from 'react';
import { ErrorState, EmptyState } from '../../organization/management-ui';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscItem, BscScoringPreview } from '../types/employee-bsc.types';

const reasonMessage: Record<string, string> = {
  ACTUAL_NOT_PROVIDED: 'Chưa nhập kết quả',
  TARGET_NOT_PROVIDED: 'Chưa có chỉ tiêu',
  TARGET_ZERO_NOT_SCORABLE: 'Chỉ tiêu bằng 0 không thể tính',
  ACTUAL_ZERO_NOT_SCORABLE: 'Kết quả bằng 0 không thể tính cho KPI càng thấp càng tốt',
  BINARY_ACTUAL_INVALID: 'KPI đạt/không đạt chỉ nhận 1 hoặc 0',
  CALCULATION_METHOD_UNSUPPORTED: 'Phương pháp tính điểm chưa được hỗ trợ',
};

type Props = {
  bscId: string;
  items: BscItem[];
  scoring: BscScoringPreview | null;
  canManage: boolean;
  canUpdateActual: boolean;
  onChange: () => Promise<void>;
};

export const BscItemTable: React.FC<Props> = ({ bscId, items, scoring, canManage, canUpdateActual, onChange }) => {
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); await onChange(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật KPI.'); }
  };
  const scoreByItem = new Map(scoring?.items.map((item) => [item.itemId, item]) ?? []);

  return <section>
    <h2>KPI</h2>
    {error && <ErrorState error={error}/>}
    {items.length === 0 ? <EmptyState message="BSC chưa có KPI."/> : <table>
      <thead><tr><th>Mã</th><th>KPI</th><th>Chỉ tiêu</th><th>Trọng số</th><th>Kết quả</th><th>Hoàn thành</th><th>Điểm</th><th>Thao tác</th></tr></thead>
      <tbody>{items.map((item) => {
        const score = scoreByItem.get(item.id);
        return <tr key={item.id}>
          <td>{item.kpi_code}</td><td>{item.kpi_name}</td><td>{item.target_value ?? item.target_text ?? '—'} {item.measurement_unit}</td>
          <td>{item.weight}%</td><td>{item.actual_value ?? item.actual_text ?? '—'}</td>
          <td>{score?.achievementPercentage === null || score?.achievementPercentage === undefined ? '—' : `${score.achievementPercentage.toFixed(4)}%`}{score?.reason && <small>{reasonMessage[score.reason] ?? score.reason}</small>}</td>
          <td>{score?.weightedScore === null || score?.weightedScore === undefined ? '—' : score.weightedScore.toFixed(4)}</td>
          <td>
            {canManage && <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => employeeBscApi.updateItem(bscId, item.id, { targetValue: Number(data.get('targetValue')), weight: Number(data.get('weight')) })); }}>
              <input aria-label={`Chỉ tiêu ${item.kpi_code}`} name="targetValue" type="number" step="any" defaultValue={item.target_value ?? ''} required/>
              <input aria-label={`Trọng số ${item.kpi_code}`} name="weight" type="number" step="0.01" defaultValue={item.weight} required/>
              <button type="submit">Lưu KPI</button>
              <button type="button" onClick={() => { if (window.confirm('Xóa KPI này?')) void run(() => employeeBscApi.deleteItem(bscId, item.id)); }}>Xóa</button>
            </form>}
            {canUpdateActual && <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => employeeBscApi.updateActual(bscId, item.id, { actualValue: Number(data.get('actualValue')), employeeNote: String(data.get('employeeNote') ?? '') })); }}>
              <input aria-label={`Kết quả ${item.kpi_code}`} name="actualValue" type="number" step="any" defaultValue={item.actual_value ?? ''} required/>
              {item.calculation_method === 'BINARY' && <small>Nhập 1 nếu đạt, 0 nếu không đạt.</small>}
              <input aria-label={`Ghi chú ${item.kpi_code}`} name="employeeNote" defaultValue={item.employee_note ?? ''}/>
              <button type="submit">Lưu kết quả</button>
            </form>}
          </td>
        </tr>;
      })}</tbody>
    </table>}
    {canManage && <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await employeeBscApi.createItem(bscId, { kpiCode: data.get('kpiCode'), kpiName: data.get('kpiName'), measurementUnit: data.get('measurementUnit'), targetValue: Number(data.get('targetValue')), weight: Number(data.get('weight')), calculationMethod: data.get('calculationMethod'), sortOrder: items.length }); form.reset(); }); }}>
      <h3>Thêm KPI</h3>
      <input name="kpiCode" placeholder="Mã KPI" required/><input name="kpiName" placeholder="Tên KPI" required/><input name="measurementUnit" placeholder="Đơn vị đo"/>
      <input name="targetValue" type="number" step="any" placeholder="Chỉ tiêu" required/><input name="weight" type="number" step="0.01" placeholder="Trọng số" required/>
      <select name="calculationMethod" defaultValue="ACTUAL_DIV_TARGET"><option value="ACTUAL_DIV_TARGET">Càng cao càng tốt</option><option value="TARGET_DIV_ACTUAL">Càng thấp càng tốt</option><option value="BINARY">Đạt/không đạt</option><option value="THRESHOLD">Theo ngưỡng (chưa hỗ trợ tính điểm)</option></select>
      <button type="submit">Thêm KPI</button>
    </form>}
  </section>;
};
