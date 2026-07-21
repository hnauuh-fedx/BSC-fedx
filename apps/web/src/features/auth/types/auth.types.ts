export interface AuthUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  status: string;
  departmentId?: string;
  positionId?: string;
  roles: Array<{ code: string; scopeType: 'GLOBAL' | 'DEPARTMENT' | 'SELF'; scopeId: string | null; permissions?: string[] }>;
  permissions: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Access token chỉ giữ trong memory, không lưu localStorage */
  accessToken: string | null;
  expiresAt: number | null;
}
