import React, { useId } from 'react';
import { flushSync } from 'react-dom';
import { SearchIcon, ShapesIcon } from 'lucide-react';
import { useSystemConfirm } from '../../components/system-confirm-dialog';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../components/ui/empty';
import { Field, FieldLabel } from '../../components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/input-group';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';

export const PageHeader: React.FC<React.PropsWithChildren<{ title: string; description?: string; action?: React.ReactNode; breadcrumb?: React.ReactNode }>> = ({ title, description, action, breadcrumb, children }) => <header className="page-header">
  <div className="min-w-0">{breadcrumb && <nav aria-label="Đường dẫn" className="breadcrumb">{breadcrumb}</nav>}<p className="page-eyebrow">BSC Management</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}{children}</div>
  {action && <div className="page-actions">{action}</div>}
</header>;

const organizationLabels: Record<string, string> = { ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa', INACTIVE: 'Ngừng hoạt động' };
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => <span className={cn('status-badge', `status-${status.toLowerCase()}`)}><span aria-hidden="true" className="status-dot"/>{organizationLabels[status] ?? status}</span>;
export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Đang tải dữ liệu…' }) => <div className="state-panel state-loading" role="status" aria-live="polite"><div className="loading-skeleton" aria-hidden="true"><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-full"/><Skeleton className="h-16 w-full"/></div><span className="sr-only">{message}</span></div>;
export const EmptyState: React.FC<{ message?: string; action?: React.ReactNode }> = ({ message = 'Không có dữ liệu phù hợp.', action }) => <Empty className="state-panel state-empty">
  <EmptyHeader><EmptyMedia variant="icon"><ShapesIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>Chưa có dữ liệu</EmptyTitle><EmptyDescription>{message}</EmptyDescription></EmptyHeader>
  {action && <EmptyContent>{action}</EmptyContent>}
</Empty>;
export const ErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => <section className="state-panel state-error" role="alert"><strong>Không thể hoàn tất</strong><p>{error}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Thử lại</Button>}</section>;
export const SearchInput: React.FC<{ value: string; onChange: (value: string) => void; label?: string }> = ({ value, onChange, label = 'Tìm kiếm' }) => {
  const id = useId();
  return <Field className="search-field"><FieldLabel htmlFor={id}>{label}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon aria-hidden="true"/></InputGroupAddon><InputGroupInput id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Nhập từ khóa…" /></InputGroup></Field>;
};
export const Pagination: React.FC<{ page: number; total: number; limit: number; onChange: (page: number) => void }> = ({ page, total, limit, onChange }) => { const pages = Math.max(1, Math.ceil(total / limit)); return <nav className="pagination" aria-label="Phân trang"><Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trang trước</Button><span aria-live="polite">Trang <strong>{page}</strong> / {pages} · {total} kết quả</span><Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Trang sau</Button></nav>; };
type ConfirmButtonProps = React.PropsWithChildren<{
  message: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}>;
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({ message, description = 'Thao tác sẽ được thực hiện ngay sau khi bạn xác nhận.', confirmLabel = 'Xác nhận', tone = 'default', onConfirm, children, className, disabled }) => {
  const confirm = useSystemConfirm();
  return <Button type="button" variant="outline" className={className} disabled={disabled} onClick={async () => {
    if (await confirm({ title: message, description, confirmLabel, tone })) await onConfirm();
  }}>{children}</Button>;
};

export const FormField: React.FC<React.PropsWithChildren<{ label: string; error?: string; helper?: string; className?: string }>> = ({ label, error, helper, className, children }) => {
  const generatedId = useId(); const inputId = `field-${generatedId}`; const errorId = `${inputId}-error`; const helperId = `${inputId}-helper`;
  const child = React.Children.only(children) as React.ReactElement<React.HTMLAttributes<HTMLElement> & { id?: string }>;
  const id = child.props.id ?? inputId;
  const describedBy = [child.props['aria-describedby'], helper ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return <div className={cn('field', className)}><label htmlFor={id}>{label}</label>{React.cloneElement(child, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}{helper && <small id={helperId} className="field-helper">{helper}</small>}{error && <small id={errorId} className="field-error" role="alert">{error}</small>}</div>;
};

type DialogProps = React.PropsWithChildren<{ open: boolean; title: string; description: string; onClose: () => void; returnFocusRef?: React.RefObject<HTMLElement | null>; busy?: boolean }>;
export const AccessibleDialog: React.FC<DialogProps> = ({ open, title, description, onClose, returnFocusRef, busy = false, children }) => {
  const close = () => { if (busy) return; flushSync(onClose); returnFocusRef?.current?.focus(); };
  return <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) close(); }}><DialogContent showCloseButton={false} className="max-h-[calc(100vh-2rem)] overflow-y-auto" onCloseAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => { event.preventDefault(); close(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <div className="dialog-content">{children}</div>
  </DialogContent></Dialog>;
};
export const TableContainer: React.FC<React.PropsWithChildren<{ label?: string }>> = ({ label = 'Bảng dữ liệu', children }) => <div className="table-container" role="region" aria-label={label} tabIndex={0}>{children}</div>;
export const DataTable: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => <table className={cn('data-table', className)} {...props}/>;
