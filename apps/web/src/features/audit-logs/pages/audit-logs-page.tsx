import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, TableContainer } from '../../organization/management-ui';
import { auditLogsApi } from '../services/audit-logs.service';
import type { AuditLogEntry } from '../types/audit-logs.types';

// ─── Helpers ──────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  auth: 'Xác thực',
  users: 'Người dùng',
  departments: 'Đơn vị',
  positions: 'Chức danh',
  roles: 'Vai trò',
  bsc: 'BSC',
  'bsc-cycles': 'Kỳ BSC',
  reports: 'Báo cáo',
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  TOKEN_REFRESH: 'Gia hạn phiên',
  USER_CREATED: 'Tạo người dùng',
  USER_UPDATED: 'Cập nhật người dùng',
  USER_ACTIVATED: 'Kích hoạt tài khoản',
  USER_DEACTIVATED: 'Ngừng hoạt động tài khoản',
  USER_LOCKED: 'Khóa tài khoản',
  USER_PASSWORD_RESET: 'Đặt lại mật khẩu',
  USER_MANAGER_CHANGED: 'Thay đổi quản lý trực tiếp',
  ROLE_PERMISSIONS_UPDATED: 'Cập nhật quyền vai trò',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) return <span style={{ color: 'var(--color-muted-foreground)' }}>—</span>;
  if (typeof value === 'string') {
    if (value === '[REDACTED]') return <span style={{ color: 'var(--color-warning, #d97706)', fontStyle: 'italic' }}>[REDACTED]</span>;
    return <span>{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--color-muted-foreground)' }}>(trống)</span>;
    return (
      <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0, listStyle: 'disc' }}>
        {value.map((item, i) => <li key={i}>{renderValue(item, depth + 1)}</li>)}
      </ul>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'var(--color-muted-foreground)' }}>(trống)</span>;
    if (depth > 2) return <code style={{ fontSize: '0.75rem' }}>{JSON.stringify(value)}</code>;
    return (
      <dl style={{ margin: '0.25rem 0 0 0.5rem' }}>
        {entries.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt style={{ fontWeight: 500, display: 'inline' }}>{k}: </dt>
            <dd style={{ display: 'inline', marginLeft: 0 }}>{renderValue(v, depth + 1)}</dd>
            <br />
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

// ─── Detail panel ─────────────────────────────────────────────────────────

const DetailPanel: React.FC<{ entry: AuditLogEntry; onClose: () => void }> = ({ entry, onClose }) => (
  <section
    role="region"
    aria-label="Chi tiết nhật ký"
    style={{
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      padding: '1rem',
      marginTop: '0.5rem',
      background: 'var(--color-card)',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
      <strong>Chi tiết: {ACTION_LABELS[entry.action] ?? entry.action}</strong>
      <button onClick={onClose} aria-label="Đóng chi tiết" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
    </div>
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 1rem', fontSize: '0.875rem' }}>
      <dt>Thời gian</dt><dd>{formatDate(entry.createdAt)}</dd>
      <dt>Người thực hiện</dt><dd>{entry.actorName ?? '—'} {entry.actorEmail ? `(${entry.actorEmail})` : ''}</dd>
      <dt>Module</dt><dd>{MODULE_LABELS[entry.module] ?? entry.module}</dd>
      <dt>Action</dt><dd><code>{entry.action}</code></dd>
      <dt>Loại đối tượng</dt><dd>{entry.entityType}</dd>
      <dt>ID đối tượng</dt><dd>{entry.entityId ? <code>{entry.entityId}</code> : '—'}</dd>
      <dt>IP</dt><dd>{entry.ipAddress ?? '—'}</dd>
    </dl>
    {(entry.oldData !== null && entry.oldData !== undefined) && (
      <div style={{ marginTop: '0.75rem' }}>
        <strong style={{ fontSize: '0.875rem' }}>Giá trị trước:</strong>
        <div style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>{renderValue(entry.oldData)}</div>
      </div>
    )}
    {(entry.newData !== null && entry.newData !== undefined) && (
      <div style={{ marginTop: '0.75rem' }}>
        <strong style={{ fontSize: '0.875rem' }}>Giá trị sau:</strong>
        <div style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>{renderValue(entry.newData)}</div>
      </div>
    )}
  </section>
);

// ─── Page ─────────────────────────────────────────────────────────────────

const LIMIT = 50;

export const AuditLogsPage: React.FC = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableModules, setAvailableModules] = useState<string[]>([]);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, mods] = await Promise.all([
        auditLogsApi.list({
          from: fromDate || undefined,
          to: toDate || undefined,
          module: filterModule || undefined,
          action: filterAction || undefined,
          page,
          limit: LIMIT,
          sortOrder: 'desc',
        }),
        auditLogsApi.modules(),
      ]);
      setEntries(result.items);
      setTotal(result.total);
      setAvailableModules(mods);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải nhật ký hệ thống.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, filterModule, filterAction, page]);

  useEffect(() => { void load(); }, [load, reload]);

  const applyFilter = () => { setPage(1); setReload((n) => n + 1); };
  const clearFilter = () => { setFromDate(''); setToDate(''); setFilterModule(''); setFilterAction(''); setPage(1); setReload((n) => n + 1); };


  return (
    <main className="space-y-5">
      <PageHeader
        title="Nhật ký hệ thống"
        description="Lịch sử thao tác theo thời gian thực. Dữ liệu chỉ đọc — không thể sửa hoặc xóa."
      />

      {/* Filters */}
      <section aria-labelledby="audit-filter-heading" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <h2 id="audit-filter-heading" className="sr-only">Bộ lọc nhật ký</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span>Từ ngày</span>
          <input id="audit-filter-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span>Đến ngày</span>
          <input id="audit-filter-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span>Module</span>
          <select id="audit-filter-module" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
            <option value="">Tất cả</option>
            {availableModules.map((m) => (
              <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span>Action</span>
          <input id="audit-filter-action" type="text" value={filterAction} onChange={(e) => setFilterAction(e.target.value)} placeholder="Ví dụ: LOGIN_SUCCESS" style={{ minWidth: 180 }} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button id="audit-apply-filter" onClick={applyFilter} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Lọc</button>
          <button id="audit-clear-filter" onClick={clearFilter} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Xóa lọc</button>
        </div>
      </section>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
      ) : entries.length === 0 ? (
        <EmptyState message="Không có nhật ký phù hợp với bộ lọc." />
      ) : (
        <>
          <TableContainer label="Nhật ký hệ thống">
            <table>
              <thead>
                <tr>
                  <th scope="col">Thời gian</th>
                  <th scope="col">Người thực hiện</th>
                  <th scope="col">Module</th>
                  <th scope="col">Action</th>
                  <th scope="col">Đối tượng</th>
                  <th scope="col">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatDate(entry.createdAt)}</td>
                      <td>
                        {entry.actorName ?? <span style={{ color: 'var(--color-muted-foreground)' }}>Hệ thống</span>}
                        {entry.actorEmail && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>{entry.actorEmail}</span>}
                      </td>
                      <td><span style={{ fontSize: '0.8rem' }}>{MODULE_LABELS[entry.module] ?? entry.module}</span></td>
                      <td><code style={{ fontSize: '0.8rem' }}>{ACTION_LABELS[entry.action] ?? entry.action}</code></td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {entry.entityType}
                        {entry.entityId && <span style={{ display: 'block', color: 'var(--color-muted-foreground)' }}>{entry.entityId.slice(0, 8)}…</span>}
                      </td>
                      <td>
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          aria-expanded={expandedId === entry.id}
                          aria-controls={`audit-detail-${entry.id}`}
                          style={{ fontSize: '0.8rem', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-primary)', textDecoration: 'underline' }}
                        >
                          {expandedId === entry.id ? 'Ẩn' : 'Xem'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr id={`audit-detail-${entry.id}`}>
                        <td colSpan={6} style={{ padding: '0.5rem 1rem' }}>
                          <DetailPanel entry={entry} onClose={() => setExpandedId(null)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </TableContainer>
          <Pagination page={page} total={total} limit={LIMIT} onChange={(p) => setPage(p)} />
        </>
      )}
    </main>
  );
};
