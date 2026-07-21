import React, { FormEvent, useMemo, useState } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useSystemConfirm } from '../../../components/system-confirm-dialog';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { ErrorState } from '../../organization/management-ui';
import { BSC_PRIMARY_GOAL_GROUP_CODE } from '../constants/employee-bsc.constants';
import { employeeBscApi } from '../services/employee-bsc.service';
import { BscGoalGroup, BscItem, BscScoringPreview } from '../types/employee-bsc.types';
import { formatBscScore } from '../utils/format-bsc-score';

const reasonMessage: Record<string, string> = {
  ACTUAL_NOT_PROVIDED: 'Chưa nhập kết quả',
  TARGET_NOT_PROVIDED: 'Chưa có chỉ tiêu',
  TARGET_ZERO_NOT_SCORABLE: 'Chỉ tiêu bằng 0 nên chưa thể tính',
  CALCULATION_METHOD_UNSUPPORTED: 'Cách tính điểm chưa được hỗ trợ',
};

type Props = {
  bscId: string;
  goalGroups: BscGoalGroup[];
  items: BscItem[];
  scoring: BscScoringPreview | null;
  canManage: boolean;
  canUpdateActual: boolean;
  isOfficial?: boolean;
  onChange: () => Promise<void>;
};

type Editor = { mode: 'create'; groupCode: string } | { mode: 'edit'; groupCode: string; item: BscItem };

export const BscItemTable: React.FC<Props> = ({ bscId, goalGroups, items, scoring, canManage, canUpdateActual, isOfficial = false, onChange }) => {
  const confirm = useSystemConfirm();
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [actualItem, setActualItem] = useState<BscItem | null>(null);
  const groups = useMemo(() => [...goalGroups].sort((a, b) => a.displayOrder - b.displayOrder), [goalGroups]);
  const groupWeights = useMemo(() => {
    const commonGroupCode = groups.find(group => group.marker === 'A')?.code;
    const weights = new Map(groups.map(group => [group.code, 0]));
    for (const item of items) {
      const groupCode = item.goal_group_code || commonGroupCode;
      if (groupCode && weights.has(groupCode)) weights.set(groupCode, (weights.get(groupCode) ?? 0) + Number(item.weight));
    }
    if (commonGroupCode && weights.has(BSC_PRIMARY_GOAL_GROUP_CODE)) {
      const commonWeight = weights.get(commonGroupCode) ?? 0;
      weights.set(BSC_PRIMARY_GOAL_GROUP_CODE, items.reduce((sum, item) => sum + Number(item.weight), 0) - commonWeight);
    }
    for (const [code, weight] of weights) weights.set(code, Number(weight.toFixed(6)));
    return weights;
  }, [groups, items]);
  const scoreByItem = new Map(scoring?.items.map(item => [item.itemId, item]) ?? []);
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight), 0);
  const normalizedTotalWeight = Number(totalWeight.toFixed(6));
  const remainingWeight = Number((100 - totalWeight).toFixed(6));
  const hasExactTotalWeight = items.length > 0 && Math.abs(totalWeight - 100) < 0.000001;
  const weightMessage = hasExactTotalWeight
    ? 'Đủ điều kiện tỷ trọng để nộp'
    : remainingWeight > 0
      ? `Còn thiếu ${remainingWeight}%`
      : `Đang vượt ${Math.abs(remainingWeight)}%`;

  const run = async (id: string, action: () => Promise<unknown>) => {
    setError('');
    setSavingId(id);
    try {
      await action();
      setEditor(null);
      setActualItem(null);
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật KPI.');
    } finally {
      setSavingId('');
    }
  };

  const itemsForGroup = (groupCode: string, groupIndex: number) => items.filter(item =>
    item.goal_group_code === groupCode || (groupIndex === 0 && !item.goal_group_code));

  if (groups.length === 0) {
    return <section aria-labelledby="kpi-table-title"><h2 id="kpi-table-title">Bảng BSC</h2><ErrorState error="Chưa cấu hình nhóm mục tiêu BSC."/></section>;
  }

  return <section aria-labelledby="kpi-table-title" className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="kpi-table-title" className="text-xl font-semibold">Bảng giao mục tiêu và đánh giá kết quả hoạt động</h2>
        <p className="text-sm text-muted-foreground">Nhóm mục tiêu được cố định theo mẫu BSC. Chọn dấu + để thêm KPO/KPI vào đúng nhóm.</p>
      </div>
      <div role="status" className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span>{items.length} KPI</span>
        <Badge variant={hasExactTotalWeight ? 'secondary' : 'destructive'}>Tổng tỷ trọng A + B: {normalizedTotalWeight}%</Badge>
        {canManage && <span className="text-muted-foreground">{weightMessage}</span>}
      </div>
    </div>
    {error && <ErrorState error={error}/>}
    <div className="rounded-lg border">
      <Table className="min-w-[1450px] border-collapse [&_td]:border-r [&_th]:border-r [&_tr>*:last-child]:border-r-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">STT</TableHead>
            <TableHead>Mục tiêu chiến lược (KPO)</TableHead>
            <TableHead>Đo lường hiệu suất (KPI)</TableHead>
            <TableHead>ĐVT</TableHead>
            <TableHead>Chỉ tiêu</TableHead>
            <TableHead>% Tỷ trọng</TableHead>
            <TableHead>Tần suất đo</TableHead>
            <TableHead>Kết quả thực hiện</TableHead>
            <TableHead>Tỉ lệ hoàn thành</TableHead>
            <TableHead>Điểm công việc</TableHead>
            <TableHead>Điểm trọng số</TableHead>
            <TableHead>TM KQTH</TableHead>
            <TableHead className="w-28 text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, groupIndex) => {
            const groupItems = itemsForGroup(group.code, groupIndex);
            return <React.Fragment key={group.code}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell className="text-center font-semibold">{group.marker}</TableCell>
                <TableHead scope="row" colSpan={4} className="h-auto whitespace-normal py-3 font-semibold">
                  {group.name}
                </TableHead>
                <TableCell aria-label={`Tỷ trọng ${group.name}`} className="bg-primary/10 text-center font-bold text-primary tabular-nums">
                  {groupWeights.get(group.code) ?? 0}%
                </TableCell>
                <TableCell colSpan={6} />
                <TableCell className="text-right">
                  {canManage && group.code !== BSC_PRIMARY_GOAL_GROUP_CODE && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Thêm KPI vào ${group.name}`} title={`Thêm KPI vào ${group.name}`} onClick={() => setEditor({ mode: 'create', groupCode: group.code })}>
                    <PlusIcon data-icon="inline-start"/>
                  </Button>}
                </TableCell>
              </TableRow>
              {groupItems.map((item, itemIndex) => {
                const score = scoreByItem.get(item.id);
                const itemNumber = /^\d+$/.test(group.marker) ? `${group.marker}.${itemIndex + 1}` : itemIndex + 1;
                return <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="text-center text-muted-foreground">{itemNumber}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{item.description?.trim() || '—'}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal"><strong>{item.kpi_name}</strong></TableCell>
                    <TableCell>{item.measurement_unit || '—'}</TableCell>
                    <TableCell>{item.target_value ?? item.target_text ?? '—'}</TableCell>
                    <TableCell>{item.weight}%</TableCell>
                    <TableCell>{item.measurement_frequency || '—'}</TableCell>
                    <TableCell>{item.actual_value ?? item.actual_text ?? '—'}</TableCell>
                    <TableCell>{score?.roundedAchievementPercentage == null ? '—' : `${score.roundedAchievementPercentage}%`}</TableCell>
                    <TableCell>{score?.roundedWorkScore == null ? '—' : String(score.roundedWorkScore)}</TableCell>
                    <TableCell>{score?.weightedScore == null ? '—' : String(score.weightedScore)}{score?.reason && <span className="block text-xs text-muted-foreground">{reasonMessage[score.reason] ?? 'Chưa thể tính điểm'}</span>}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{item.employee_note?.trim() || '—'}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      {canManage && <><Button type="button" variant="ghost" size="icon-sm" aria-label={`Sửa KPI ${item.kpi_name}`} onClick={() => setEditor({ mode: 'edit', groupCode: group.code, item })}><PencilIcon data-icon="inline-start"/></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Xóa KPI ${item.kpi_name}`} disabled={savingId === item.id} onClick={async () => {
                        const accepted = await confirm({
                          title: 'Xóa KPI?',
                          description: `KPI “${item.kpi_name}” sẽ bị xóa khỏi BSC. Hành động này không thể hoàn tác.`,
                          confirmLabel: 'Xóa KPI',
                          tone: 'destructive',
                        });
                        if (accepted) void run(item.id, () => employeeBscApi.deleteItem(bscId, item.id));
                      }}><Trash2Icon data-icon="inline-start"/></Button></>}
                      {canUpdateActual && <Button type="button" variant="outline" size="sm" onClick={() => setActualItem(item)}>Nhập kết quả</Button>}
                    </div></TableCell>
                  </TableRow>
                  {editor?.mode === 'edit' && editor.item.id === item.id && (<KpiEditorRow group={group} item={item} busy={savingId === item.id} onCancel={() => setEditor(null)} onSubmit={(event) => {
                    const payload = definitionPayload(event, group.code, item.sort_order, item.kpi_code);
                    void run(item.id, () => employeeBscApi.updateItem(bscId, item.id, payload));
                  }}/>)}
                  {actualItem?.id === item.id && (<ActualEditorRow item={item} busy={savingId === item.id} onCancel={() => setActualItem(null)} onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run(item.id, () => employeeBscApi.updateActual(bscId, item.id, { actualValue: Number(data.get('actualValue')), employeeNote: String(data.get('employeeNote') ?? '') }));
                  }}/>) }
                </React.Fragment>;
              })}
              {editor?.mode === 'create' && editor.groupCode === group.code && (<KpiEditorRow group={group} busy={savingId === 'new'} onCancel={() => setEditor(null)} onSubmit={(event) => {
                const nextSortOrder = items.length === 0 ? 0 : Math.max(...items.map(item => item.sort_order)) + 1;
                const payload = definitionPayload(event, group.code, nextSortOrder, `KPI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
                void run('new', () => employeeBscApi.createItem(bscId, payload));
              }}/>) }
            </React.Fragment>;
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row" colSpan={10} className="h-auto py-3"><strong>ĐIỂM ĐÁNH GIÁ {isOfficial ? 'CHÍNH THỨC' : 'DỰ KIẾN'}</strong></TableHead>
            <TableCell><strong>{scoring ? formatBscScore(scoring.totalWeightedScore) : '—'}</strong></TableCell>
            <TableCell colSpan={2} />
          </TableRow>
          <TableRow>
            <TableHead scope="row" colSpan={10} className="h-auto py-3"><strong>LOẠI THÀNH TÍCH {isOfficial ? 'CHÍNH THỨC' : 'DỰ KIẾN'}</strong></TableHead>
            <TableCell colSpan={3}>
              {scoring?.isComplete && scoring.classification
                ? <Badge variant="secondary">{scoring.classification}</Badge>
                : <span className="text-muted-foreground">Chưa đủ dữ liệu</span>}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  </section>;
};

function definitionPayload(event: FormEvent<HTMLFormElement>, goalGroupCode: string, sortOrder: number, kpiCode: string) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  return {
    kpiCode,
    goalGroupCode,
    description: String(data.get('description') ?? '').trim(),
    kpiName: String(data.get('kpiName') ?? '').trim(),
    measurementUnit: '%',
    targetValue: Number(data.get('targetValue')),
    weight: Number(data.get('weight')),
    measurementFrequency: 'Tháng',
    calculationMethod: 'ACTUAL_DIV_TARGET',
    sortOrder,
  };
}

function KpiEditorRow({ group, item, busy, onCancel, onSubmit }: { group: BscGoalGroup; item?: BscItem; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const prefix = `${item?.id ?? `new-${group.code}`}`;
  return <TableRow>
    <TableCell colSpan={13} className="bg-muted/20 whitespace-normal">
      <form aria-label={`${item ? 'Sửa KPI trong' : 'Thêm KPI vào'} ${group.name}`} onSubmit={onSubmit} className="flex flex-col gap-4 py-2">
        <p className="font-medium">{group.marker}. {group.name}</p>
        <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field><FieldLabel htmlFor={`${prefix}-kpo`}>Mục tiêu chiến lược (KPO)</FieldLabel><Input id={`${prefix}-kpo`} name="description" defaultValue={item?.description ?? ''} required/></Field>
          <Field><FieldLabel htmlFor={`${prefix}-kpi`}>Đo lường hiệu suất (KPI)</FieldLabel><Input id={`${prefix}-kpi`} name="kpiName" defaultValue={item?.kpi_name ?? ''} required/></Field>
          <Field data-disabled><FieldLabel htmlFor={`${prefix}-unit`}>Đơn vị tính</FieldLabel><Input id={`${prefix}-unit`} value="%" disabled/></Field>
          <Field><FieldLabel htmlFor={`${prefix}-target`}>Chỉ tiêu</FieldLabel><Input id={`${prefix}-target`} name="targetValue" type="number" step="any" defaultValue={item ? item.target_value ?? '' : 100} required/></Field>
          <Field><FieldLabel htmlFor={`${prefix}-weight`}>Tỷ trọng (%)</FieldLabel><Input id={`${prefix}-weight`} name="weight" type="number" min="0" max="100" step="0.01" defaultValue={item?.weight ?? ''} required/></Field>
          <Field data-disabled><FieldLabel htmlFor={`${prefix}-frequency`}>Tần suất đo</FieldLabel><Input id={`${prefix}-frequency`} value="Tháng" disabled/></Field>
        </FieldGroup>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}><XIcon data-icon="inline-start"/>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu KPI'}</Button></div>
      </form>
    </TableCell>
  </TableRow>;
}

function ActualEditorRow({ item, busy, onCancel, onSubmit }: { item: BscItem; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <TableRow><TableCell colSpan={13} className="bg-muted/20 whitespace-normal"><form aria-label={`Cập nhật kết quả ${item.kpi_code}`} onSubmit={onSubmit} className="flex flex-col gap-4 py-2"><FieldGroup className="grid gap-3 md:grid-cols-2"><Field><FieldLabel htmlFor={`${item.id}-actual`}>Kết quả thực hiện</FieldLabel><Input id={`${item.id}-actual`} name="actualValue" type="number" step="any" defaultValue={item.actual_value ?? ''} required/></Field><Field><FieldLabel htmlFor={`${item.id}-note`}>TM KQTH</FieldLabel><Input id={`${item.id}-note`} name="employeeNote" defaultValue={item.employee_note ?? ''}/></Field></FieldGroup><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu kết quả'}</Button></div></form></TableCell></TableRow>;
}
