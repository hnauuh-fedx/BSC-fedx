import React, { useEffect, useId, useRef } from 'react';
import { useSystemConfirm } from '../../components/system-confirm-dialog';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

export const PageHeader: React.FC<React.PropsWithChildren<{ title: string; description?: string; action?: React.ReactNode; breadcrumb?: React.ReactNode }>> = ({ title, description, action, breadcrumb, children }) => <header className="page-header">
  <div className="min-w-0">{breadcrumb && <nav aria-label="Đường dẫn" className="breadcrumb">{breadcrumb}</nav>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}{children}</div>
  {action && <div className="page-actions">{action}</div>}
</header>;

const organizationLabels: Record<string, string> = { ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa', INACTIVE: 'Ngừng hoạt động' };
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => <span className={cn('status-badge', `status-${status.toLowerCase()}`)}><span aria-hidden="true" className="status-dot"/>{organizationLabels[status] ?? status}</span>;
export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Đang tải dữ liệu…' }) => <div className="state-panel" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true"/>{message}</div>;
export const EmptyState: React.FC<{ message?: string; action?: React.ReactNode }> = ({ message = 'Không có dữ liệu phù hợp.', action }) => <section className="state-panel state-empty"><strong>Chưa có dữ liệu</strong><p>{message}</p>{action}</section>;
export const ErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => <section className="state-panel state-error" role="alert"><strong>Không thể hoàn tất</strong><p>{error}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Thử lại</Button>}</section>;
export const SearchInput: React.FC<{ value: string; onChange: (value: string) => void; label?: string }> = ({ value, onChange, label = 'Tìm kiếm' }) => <label className="field search-field"><span>{label}</span><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Nhập từ khóa…" /></label>;
export const Pagination: React.FC<{ page: number; total: number; limit: number; onChange: (page: number) => void }> = ({ page, total, limit, onChange }) => { const pages = Math.max(1, Math.ceil(total / limit)); return <nav className="pagination" aria-label="Phân trang"><Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trang trước</Button><span aria-live="polite">Trang <strong>{page}</strong> / {pages} · {total} kết quả</span><Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Trang sau</Button></nav>; };
type ConfirmButtonProps = React.PropsWithChildren<{
  message: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  className?: string;
}>;
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({ message, description = 'Thao tác sẽ được thực hiện ngay sau khi bạn xác nhận.', confirmLabel = 'Xác nhận', tone = 'default', onConfirm, children, className }) => {
  const confirm = useSystemConfirm();
  return <Button type="button" variant="outline" className={className} onClick={async () => {
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
  const titleId = useId(); const descriptionId = useId(); const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const previous = returnFocusRef?.current ?? document.activeElement as HTMLElement | null; const timer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')?.focus(), 0); return () => { window.clearTimeout(timer); previous?.focus(); }; }, [open, returnFocusRef]);
  if (!open) return null;
  return <div className="dialog-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}><div ref={panelRef} className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key !== 'Tab') return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []).filter(element => !element.hasAttribute('hidden'));
    if (focusable.length === 0) { event.preventDefault(); panelRef.current?.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} tabIndex={-1}><header><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></header><div className="dialog-content">{children}</div></div></div>;
};
export const TableContainer: React.FC<React.PropsWithChildren<{ label?: string }>> = ({ label = 'Bảng dữ liệu', children }) => <div className="table-container" role="region" aria-label={label} tabIndex={0}>{children}</div>;
export const DataTable: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => <table className={cn('data-table', className)} {...props}/>;
