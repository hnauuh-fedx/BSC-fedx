import { useAuthContext } from '../../../app/store/auth-store';
import type { AuthStatus, AuthUser, LoginRequest } from '../types/auth.types';

export type UseAuthResult = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: AuthStatus;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
  updateCurrentUser?: (user: AuthUser) => void;
  clearSession?: () => void;
};

/**
 * Hook tiện ích để truy cập auth state trong bất kỳ component nào.
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth(): UseAuthResult {
  const { state, login, logout, getAccessToken, updateCurrentUser, clearSession } = useAuthContext();

  return {
    user: state.user,
    isAuthenticated: state.status === 'authenticated',
    isLoading: state.status === 'loading' || state.status === 'idle',
    status: state.status,
    login,
    logout,
    getAccessToken,
    updateCurrentUser,
    clearSession,
  };
}
