import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { bscCyclesApi, BscCycle } from '../../bsc-cycles';
import { EmptyState, ErrorState, FormField, LoadingState, PageHeader } from '../../organization/management-ui';
import { employeeBscApi } from '../services/employee-bsc.service';

const cycleLabel = (cycle: BscCycle) => {
  const period = cycle.month ? `${String(cycle.month).padStart(2, '0')}/${cycle.year}` : String(cycle.year);
  return `${cycle.name} — ${period} (${new Date(cycle.startDate).toLocaleDateString('vi-VN')}–${new Date(cycle.endDate).toLocaleDateString('vi-VN')})`;
};

export const BscCreatePage: React.FC = () => {
  const [cycleId, setCycleId] = useState('');
  const [cycles, setCycles] = useState<BscCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const loadCycles = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const result = await bscCyclesApi.open();
      setCycles(result);
      setCycleId((current) => current && result.some((cycle) => cycle.id === current) ? current : (result[0]?.id ?? ''));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Không thể tải danh sách kỳ BSC.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCycles(); }, [loadCycles]);

  const save = async () => {
    setSaving(true); setSaveError('');
    try { const bsc = await employeeBscApi.create(cycleId); navigate(`/employee-bsc/${bsc.id}`); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không thể tạo BSC.'); }
    finally { setSaving(false); }
  };

  return <main>
    <PageHeader title="Tạo BSC nháp"/>
    {loading ? <LoadingState/> : loadError ? <><ErrorState error={loadError}/><button onClick={() => void loadCycles()}>Thử lại</button></> : cycles.length === 0 ? <EmptyState message="Hiện không có kỳ BSC đang mở."/> : <FormField label="Kỳ BSC">
      <select value={cycleId} onChange={(event) => setCycleId(event.target.value)}>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycleLabel(cycle)}</option>)}</select>
    </FormField>}
    {saveError && <ErrorState error={saveError}/>}
    <button disabled={saving || loading || Boolean(loadError) || !cycleId} onClick={() => void save()}>{saving ? 'Đang tạo…' : 'Tạo BSC'}</button> <Link to="/employee-bsc">Hủy</Link>
  </main>;
};
