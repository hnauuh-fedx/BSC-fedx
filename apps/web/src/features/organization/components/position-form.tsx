import React, { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ErrorState, FormField } from '../management-ui';

export type PositionFormValues = { code: string; name: string; level: string };
export type PositionPayload = { code: string; name: string; level: number };

const EMPTY_POSITION: PositionFormValues = { code: '', name: '', level: '' };
const LEVEL_HELPER = 'Số càng lớn thể hiện chức danh có thứ bậc tổ chức cao hơn. Giá trị này chỉ dùng để sắp xếp, không tự động cấp quyền.';

function validate(values: PositionFormValues) {
  const errors: Partial<Record<keyof PositionFormValues, string>> = {};
  const code = values.code.trim();
  const name = values.name.trim();
  const levelText = values.level.trim();

  if (!code) errors.code = 'Vui lòng nhập mã chức danh.';
  else if (code.toUpperCase() === 'ADMIN') errors.code = 'ADMIN là mã vai trò hệ thống, không phải mã chức danh.';
  if (!name) errors.name = 'Vui lòng nhập tên chức danh.';
  if (!levelText) errors.level = 'Vui lòng nhập thứ bậc tổ chức.';
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

  return <form onSubmit={event => void submit(event)} noValidate>
    <FormField label="Mã" error={errors.code}>
      <Input value={values.code} onChange={event => update('code', event.target.value.toUpperCase())} disabled={submitting} />
    </FormField>
    <FormField label="Tên" error={errors.name}>
      <Input value={values.name} onChange={event => update('name', event.target.value)} disabled={submitting} />
    </FormField>
    <FormField label="Thứ bậc tổ chức" helper={LEVEL_HELPER} error={errors.level}>
      <Input type="number" inputMode="numeric" min="1" max="999" step="1" placeholder="Ví dụ: 10, 20, 30..." value={values.level} onChange={event => update('level', event.target.value)} disabled={submitting} />
    </FormField>
    {apiError && <ErrorState error={apiError} />}
    <Button type="submit" disabled={submitting}>
      {submitting && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
      {submitting ? 'Đang lưu…' : submitLabel}
    </Button>
  </form>;
}
