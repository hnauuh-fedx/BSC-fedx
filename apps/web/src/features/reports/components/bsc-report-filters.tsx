import { useMemo } from 'react';
import { ChevronDownIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '../../organization/management-ui';
import { ReportOptions } from '../reports.types';
import { workflowStatusLabel } from '../report-status';

const ALL = 'ALL';
const STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED'];
const EVALUATION_STATUSES = ['NOT_STARTED', ...STATUSES];

export const FilterSelect: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ id, label, value, onChange, options }) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue/></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
);

const EmployeeCombobox: React.FC<{
  value: string;
  options: ReportOptions['employees'];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const items = useMemo(() => [
    { id: ALL, label: 'Tất cả nhân viên' },
    ...options.map(item => ({ id: item.id, label: `${item.full_name} · ${item.employee_code}` })),
  ], [options]);
  const selected = items.find(item => item.id === value) ?? items[0];

  return (
    <Field>
      <FieldLabel htmlFor="report-employee">Nhân viên</FieldLabel>
      <Combobox
        items={items}
        value={selected}
        onValueChange={item => onChange(item?.id ?? ALL)}
        itemToStringValue={item => item.label}
      >
        <ComboboxInput id="report-employee" placeholder="Tìm và chọn nhân viên" showClear={value !== ALL}/>
        <ComboboxContent>
          <ComboboxEmpty>Không tìm thấy nhân viên.</ComboboxEmpty>
          <ComboboxList>
            {item => <ComboboxItem key={item.id} value={item}>{item.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
};

export type ReportFilterValues = {
  departmentId: string;
  employeeId: string;
  search: string;
  planStatus: string;
  evaluationStatus: string;
  finalGrade: string;
  sortBy: string;
  sortOrder: string;
};

export const BscReportFilters: React.FC<{
  options: ReportOptions | null;
  isManagement: boolean;
  values: ReportFilterValues;
  activeFilterCount: number;
  onChange: (key: keyof ReportFilterValues, value: string) => void;
  onReset: () => void;
}> = ({ options, isManagement, values, activeFilterCount, onChange, onReset }) => (
  <Collapsible
    defaultOpen={
      values.planStatus !== ALL
      || values.evaluationStatus !== ALL
      || values.finalGrade !== ALL
      || values.sortBy !== 'created_at'
      || values.sortOrder !== 'desc'
    }
  >
    <Card>
      <CardHeader>
        <CardTitle>Bộ lọc danh sách</CardTitle>
        <CardDescription>Kết hợp điều kiện để thu hẹp dữ liệu trước khi xem hoặc xuất báo cáo.</CardDescription>
        <CardAction>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="group">
              Bộ lọc nâng cao
              <ChevronDownIcon
                data-icon="inline-end"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isManagement && (
          <FieldGroup className="grid grid-cols-3 items-end gap-4">
            <FilterSelect
              id="report-department"
              label="Phòng ban"
              value={values.departmentId}
              onChange={value => onChange('departmentId', value)}
              options={[
                { value: ALL, label: 'Tất cả phòng ban' },
                ...(options?.departments ?? []).map(item => ({ value: item.id, label: item.name })),
              ]}
            />
            <EmployeeCombobox
              value={values.employeeId}
              options={options?.employees ?? []}
              onChange={value => onChange('employeeId', value)}
            />
            <SearchInput value={values.search} onChange={value => onChange('search', value)} label="Tìm nhân viên"/>
          </FieldGroup>
        )}
        <CollapsibleContent>
          <FieldGroup className="grid grid-cols-4 items-end gap-4">
            <FilterSelect id="report-plan" label="Trạng thái kế hoạch" value={values.planStatus} onChange={value => onChange('planStatus', value)} options={[
              { value: ALL, label: 'Tất cả' },
              ...STATUSES.map(item => ({ value: item, label: workflowStatusLabel(item) })),
            ]}/>
            <FilterSelect id="report-evaluation" label="Trạng thái đánh giá" value={values.evaluationStatus} onChange={value => onChange('evaluationStatus', value)} options={[
              { value: ALL, label: 'Tất cả' },
              ...EVALUATION_STATUSES.map(item => ({ value: item, label: workflowStatusLabel(item) })),
            ]}/>
            <FilterSelect id="report-grade" label="Xếp loại" value={values.finalGrade} onChange={value => onChange('finalGrade', value)} options={[
              { value: ALL, label: 'Tất cả' },
              ...(options?.grades ?? []).map(item => ({ value: item.value, label: item.label })),
            ]}/>
            <FilterSelect id="report-sort" label="Sắp xếp" value={values.sortBy} onChange={value => onChange('sortBy', value)} options={[
              { value: 'created_at', label: 'Ngày tạo' },
              { value: 'final_score', label: 'Điểm cuối' },
              { value: 'plan_approved_at', label: 'Ngày duyệt kế hoạch' },
              { value: 'evaluation_approved_at', label: 'Ngày duyệt đánh giá' },
            ]}/>
            <FilterSelect id="report-order" label="Thứ tự" value={values.sortOrder} onChange={value => onChange('sortOrder', value)} options={[
              { value: 'desc', label: 'Giảm dần' },
              { value: 'asc', label: 'Tăng dần' },
            ]}/>
            <Field>
              <FieldLabel className="sr-only">Đặt lại</FieldLabel>
              <Button variant="outline" onClick={onReset} disabled={activeFilterCount === 0 && values.sortBy === 'created_at' && values.sortOrder === 'desc'}>
                <RotateCcwIcon data-icon="inline-start"/>Đặt lại bộ lọc
              </Button>
            </Field>
          </FieldGroup>
        </CollapsibleContent>
      </CardContent>
    </Card>
  </Collapsible>
);
