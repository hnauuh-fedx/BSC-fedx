import React, { useId, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { ErrorState, FormField } from '../management-ui';

export type PositionFormValues = { code: string; name: string; level: string };
export type PositionPayload = { code: string; name: string; level: number };

const EMPTY_POSITION: PositionFormValues = { code: '', name: '', level: '' };
const LEVEL_HELPER = 'Số càng lớn thể hiện chức danh có thứ bậc tổ chức cao hơn. Giá trị này chỉ dùng để sắp xếp, không tự động cấp quyền.';
const RANK_OPTIONS = [
  { value: '10', label: 'Bậc 1 — Nhân viên / Chuyên viên', title: 'Phù hợp với các chức danh thực thi công việc chuyên môn.' },
  { value: '20', label: 'Bậc 2 — Chuyên viên chính', title: 'Phù hợp với chức danh chuyên môn có kinh nghiệm hoặc trách nhiệm cao hơn.' },
  { value: '30', label: 'Bậc 3 — Trưởng nhóm / Giám sát', title: 'Phù hợp với chức danh điều phối một nhóm công việc.' },
  { value: '40', label: 'Bậc 4 — Phó phòng', title: 'Phù hợp với chức danh hỗ trợ quản lý một phòng hoặc bộ phận.' },
  { value: '50', label: 'Bậc 5 — Trưởng phòng / Quản lý', title: 'Phù hợp với chức danh chịu trách nhiệm quản lý một phòng hoặc bộ phận.' },
  { value: '60', label: 'Bậc 6 — Lãnh đạo đơn vị', title: 'Phù hợp với chức danh lãnh đạo một đơn vị hoặc khối.' },
  { value: '70', label: 'Bậc 7 — Lãnh đạo cấp cao', title: 'Phù hợp với chức danh lãnh đạo cấp cao nhất trong cơ cấu.' },
] as const;

function validate(values: PositionFormValues) {
  const errors: Partial<Record<keyof PositionFormValues, string>> = {};
  const code = values.code.trim();
  const name = values.name.trim();
  const levelText = values.level.trim();

  if (!code) errors.code = 'Vui lòng nhập mã chức danh.';
  else if (code.toUpperCase() === 'ADMIN') errors.code = 'ADMIN là mã vai trò hệ thống, không phải mã chức danh.';
  if (!name) errors.name = 'Vui lòng nhập tên chức danh.';
  if (!levelText) errors.level = 'Vui lòng chọn thứ bậc tổ chức.';
  else if (!/^-?\d+$/.test(levelText)) errors.level = 'Thứ bậc tổ chức phải là số nguyên.';
  else if (Number(levelText) < 1 || Number(levelText) > 999) errors.level = 'Thứ bậc tổ chức phải nằm trong khoảng từ 1 đến 999.';

  return errors;
}

export function PositionForm({
  initialValues = EMPTY_POSITION,
  submitLabel,
  resetOnSuccess = false,
  onSubmit,
}: {
  initialValues?: PositionFormValues;
  submitLabel: string;
  resetOnSuccess?: boolean;
  onSubmit: (payload: PositionPayload) => Promise<void>;
}) {
  const [values, setValues] = useState<PositionFormValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof PositionFormValues, string>>>({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const rankFieldId = useId();
  const rankOptions = values.level && !RANK_OPTIONS.some(option => option.value === values.level)
    ? [{ value: values.level, label: `Bậc hiện tại — ${values.level}`, title: 'Giá trị thứ bậc đang được lưu từ dữ liệu trước đây.' }, ...RANK_OPTIONS]
    : RANK_OPTIONS;

  const update = (field: keyof PositionFormValues, value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setApiError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await onSubmit({ code: values.code.trim().toUpperCase(), name: values.name.trim(), level: Number(values.level.trim()) });
      if (resetOnSuccess) setValues(EMPTY_POSITION);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể lưu chức danh.');
    } finally {
      setSubmitting(false);
    }
  };

  return <form className="grid gap-4 md:grid-cols-2" onSubmit={event => void submit(event)} noValidate>
    <FormField label="Mã" error={errors.code}>
      <Input value={values.code} onChange={event => update('code', event.target.value.toUpperCase())} disabled={submitting} />
    </FormField>
    <FormField label="Tên" error={errors.name}>
      <Input value={values.name} onChange={event => update('name', event.target.value)} disabled={submitting} />
    </FormField>
    <div className="field md:col-span-2">
      <label id={`${rankFieldId}-label`} htmlFor={rankFieldId}>Thứ bậc tổ chức</label>
      <Select value={values.level} onValueChange={value => update('level', value)} disabled={submitting}>
        <SelectTrigger id={rankFieldId} aria-labelledby={`${rankFieldId}-label`} aria-describedby={`${rankFieldId}-helper${errors.level ? ` ${rankFieldId}-error` : ''}`} aria-invalid={errors.level ? true : undefined} className="w-full">
          <SelectValue placeholder="Chọn thứ bậc phù hợp" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {rankOptions.map(option => <SelectItem key={option.value} value={option.value} title={option.title}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <small id={`${rankFieldId}-helper`} className="field-helper">{LEVEL_HELPER}</small>
      {errors.level && <small id={`${rankFieldId}-error`} className="field-error" role="alert">{errors.level}</small>}
    </div>
    {apiError && <div className="md:col-span-2"><ErrorState error={apiError} /></div>}
    <Button type="submit" className="w-fit md:col-span-2" disabled={submitting}>
      {submitting && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
      {submitting ? 'Đang lưu…' : submitLabel}
    </Button>
  </form>;
}
