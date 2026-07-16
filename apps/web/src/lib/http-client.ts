import { API_BASE_URL } from './api-base-url';

export class ApiError extends Error { constructor(public readonly status: number, public readonly code?: string) { super('API request failed'); } }
const messages: Record<string, string> = {
  AUTH_PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.', AUTH_SCOPE_DENIED: 'Bạn không có quyền truy cập phạm vi dữ liệu này.',
  DEPARTMENT_CODE_EXISTS: 'Mã đơn vị đã tồn tại.', DEPARTMENT_CYCLE: 'Quan hệ đơn vị cha tạo thành vòng lặp.', DEPARTMENT_HAS_ACTIVE_CHILDREN: 'Đơn vị còn đơn vị con đang hoạt động.', DEPARTMENT_HAS_ACTIVE_USERS: 'Đơn vị còn người dùng đang hoạt động.',
  POSITION_CODE_EXISTS: 'Mã chức danh đã tồn tại.', POSITION_HAS_ACTIVE_USERS: 'Chức danh còn người dùng đang hoạt động.',
  USER_INVALID_DEPARTMENT: 'Đơn vị không hợp lệ hoặc đã ngừng hoạt động.', USER_INVALID_POSITION: 'Chức danh không hợp lệ hoặc đã ngừng hoạt động.', USER_INVALID_MANAGER: 'Quản lý trực tiếp không hợp lệ.', USER_MANAGER_CYCLE: 'Quan hệ quản lý tạo thành vòng lặp.', USER_LAST_ACTIVE_ADMIN: 'Không thể khóa ADMIN khả dụng cuối cùng.',
  BSC_ACCESS_DENIED: 'Bạn không có quyền xử lý BSC này.', BSC_INVALID_TRANSITION: 'Trạng thái BSC không cho phép thao tác này.', BSC_WORKFLOW_CONFLICT: 'BSC vừa được xử lý bởi yêu cầu khác. Vui lòng tải lại.',
  BSC_TOTAL_WEIGHT_NOT_100: 'Tổng trọng số KPI phải bằng 100%.', BSC_SCORING_INCOMPLETE: 'BSC còn KPI chưa đủ dữ liệu để tính điểm.', BSC_BINARY_ACTUAL_INVALID: 'KPI đạt/không đạt chỉ nhận kết quả 1 hoặc 0.',
  BSC_RETURN_REASON_REQUIRED: 'Vui lòng nhập lý do trả lại.', BSC_CYCLE_NOT_OPEN: 'Kỳ BSC chưa mở hoặc đã đóng.', BSC_SUBMISSION_DEADLINE_PASSED: 'Đã quá hạn nộp BSC.',
};
type AuthHandlers = { getAccessToken: () => string | null; refresh: () => Promise<string | null>; onUnauthenticated: () => void };
let auth: AuthHandlers | null = null;
let refreshInFlight: Promise<string | null> | null = null;
export function configureHttpClient(handlers: AuthHandlers | null) { auth = handlers; }

async function responseFor(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = auth?.getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && path !== '/auth/refresh' && auth) {
    refreshInFlight ??= auth.refresh().finally(() => { refreshInFlight = null; });
    const refreshed = await refreshInFlight;
    if (refreshed) return responseFor(path, init, false);
    auth.onUnauthenticated();
  }
  if (!response.ok) { const body = await response.json().catch(() => ({})); const error = new ApiError(response.status, body.code); error.message = messages[body.code] ?? (typeof body.message === 'string' ? body.message : 'Không thể hoàn tất yêu cầu.'); throw error; }
  return response;
}
async function execute<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await responseFor(path, init);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const httpClient = {
  get: <T>(path: string) => execute<T>(path),
  post: <T>(path: string, body?: unknown) => execute<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => execute<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => execute<T>(path, { method: 'DELETE' }),
  download: async (path: string) => {
    const response = await responseFor(path);
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'download.xlsx';
    return { blob: await response.blob(), fileName };
  },
};
