import { useAuthContext } from '../../../app/store/auth-store';

/**
 * Hook tiện ích để truy cập auth state trong bất kỳ component nào.
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth() {
  const { state, login, logout, getAccessToken } = useAuthContext();

  return {
    user: state.user,
    isAuthenticated: state.status === 'authenticated',
    isLoading: state.status === 'loading' || state.status === 'idle',
    status: state.status,
    login,
    logout,
    getAccessToken,
  };
}
