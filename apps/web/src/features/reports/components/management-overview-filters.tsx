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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { SearchInput } from '../../organization/management-ui';
import type { ReportOptions } from '../reports.types';
import { REPORT_EVALUATION_STATUSES, REPORT_PLAN_STATUSES, workflowStatusLabel } from '../report-status';
import { EmployeeCombobox, FilterSelect } from './bsc-report-filters';

export const OVERVIEW_ALL = 'ALL';

export type ManagementOverviewFilterValues = {
  cycleId: string;
  departmentId: string;
  employeeId: string;
  search: string;
  planStatus: string;
  evaluationStatus: string;
  finalGrade: string;
};

export const ManagementOverviewFilters: React.FC<{
  options: ReportOptions;
  values: ManagementOverviewFilterValues;
  employees: ReportOptions['employees'];
  activeFilterCount: number;
  onChange: (key: keyof ManagementOverviewFilterValues, value: string) => void;
  onReset: () => void;
}> = ({ options, values, employees, activeFilterCount, onChange, onReset }) => (
  <Collapsible
    defaultOpen={
      values.planStatus !== OVERVIEW_ALL
      || values.evaluationStatus !== OVERVIEW_ALL
      || values.finalGrade !== OVERVIEW_ALL
    }
  >
    <Card>
      <CardHeader>
        <CardTitle>Bộ lọc tổng quan</CardTitle>
        <CardDescription>
          Các chỉ số và danh sách BSC bên dưới sử dụng cùng phạm vi lọc.
        </CardDescription>
        <CardAction>
          <CollapsibleTrigger asChild>
            <Button variant="outline">
              Bộ lọc nâng cao
              <ChevronDownIcon data-icon="inline-end"/>
            </Button>
          </CollapsibleTrigger>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            id="overview-cycle"
            label="Kỳ BSC"
            value={values.cycleId}
            onChange={value => onChange('cycleId', value)}
            options={options.cycles.map(item => ({ value: item.id, label: item.name }))}
          />
          <FilterSelect
            id="overview-department"
            label="Phòng ban"
            value={values.departmentId}
            onChange={value => onChange('departmentId', value)}
            options={[
              { value: OVERVIEW_ALL, label: 'Tất cả phòng ban' },
              ...options.departments.map(item => ({ value: item.id, label: item.name })),
            ]}
          />
          <EmployeeCombobox
            value={values.employeeId}
            options={employees}
            onChange={value => onChange('employeeId', value)}
          />
          <SearchInput
            value={values.search}
            onChange={value => onChange('search', value)}
            label="Tìm nhân viên"
          />
        </FieldGroup>

        <CollapsibleContent>
          <FieldGroup className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="overview-plan-status"
              label="Trạng thái kế hoạch"
              value={values.planStatus}
              onChange={value => onChange('planStatus', value)}
              options={[
                { value: OVERVIEW_ALL, label: 'Tất cả' },
                ...REPORT_PLAN_STATUSES.map(item => ({ value: item, label: workflowStatusLabel(item) })),
              ]}
            />
            <FilterSelect
              id="overview-evaluation-status"
              label="Trạng thái đánh giá"
              value={values.evaluationStatus}
              onChange={value => onChange('evaluationStatus', value)}
              options={[
                { value: OVERVIEW_ALL, label: 'Tất cả' },
                ...REPORT_EVALUATION_STATUSES.map(item => ({ value: item, label: workflowStatusLabel(item) })),
              ]}
            />
            <FilterSelect
              id="overview-grade"
              label="Xếp loại"
              value={values.finalGrade}
              onChange={value => onChange('finalGrade', value)}
              options={[
                { value: OVERVIEW_ALL, label: 'Tất cả' },
                ...options.grades.map(item => ({ value: item.value, label: item.label })),
              ]}
            />
            <Field>
              <FieldLabel className="sr-only">Đặt lại</FieldLabel>
              <Button variant="outline" onClick={onReset} disabled={activeFilterCount === 0}>
                <RotateCcwIcon data-icon="inline-start"/>
                Đặt lại bộ lọc
              </Button>
            </Field>
          </FieldGroup>
        </CollapsibleContent>
      </CardContent>
    </Card>
  </Collapsible>
);
