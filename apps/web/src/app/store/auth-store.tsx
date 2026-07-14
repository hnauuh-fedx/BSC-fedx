import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { AuthState, AuthUser, LoginRequest } from '../../features/auth/types/auth.types';
import { authService } from '../../features/auth/services/auth.service';
import { configureHttpClient } from '../../lib/http-client';

// ─── State & Actions ────────────────────────────────────────────

type AuthAction =
  | { type: 'SET_LOADING' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: AuthUser; accessToken: string; expiresAt: number } }
  | { type: 'LOGOUT' }
  | { type: 'REFRESH_SUCCESS'; payload: { accessToken: string; expiresAt: number } }
  | { type: 'SET_UNAUTHENTICATED' };

const initialState: AuthState = {
  status: 'idle',
  user: null,
  accessToken: null,
  expiresAt: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, status: 'loading' };

    case 'LOGIN_SUCCESS':
      return {
        status: 'authenticated',
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        expiresAt: action.payload.expiresAt,
      };

    case 'REFRESH_SUCCESS':
      return {
        ...state,
        status: 'authenticated',
        accessToken: action.payload.accessToken,
        expiresAt: action.payload.expiresAt,
      };

    case 'LOGOUT':
    case 'SET_UNAUTHENTICATED':
      return {
        status: 'unauthenticated',
        user: null,
        accessToken: null,
        expiresAt: null,
      };

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────

interface AuthContextValue {
  state: AuthState;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Trả access token hiện tại, hoặc null nếu chưa đăng nhập */
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /** Thử silent refresh khi mount — để khôi phục session từ HttpOnly cookie */
  useEffect(() => {
    let cancelled = false;

    async function tryRestore() {
      dispatch({ type: 'SET_LOADING' });
      try {
        const result = await authService.refresh();
        if (cancelled) return;
        const user = await authService.getCurrentUser(result.accessToken);
        if (cancelled) return;
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user,
            accessToken: result.accessToken,
            expiresAt: Date.now() + result.expiresIn * 1000,
          },
        });
      } catch {
        if (!cancelled) dispatch({ type: 'SET_UNAUTHENTICATED' });
      }
    }

    void tryRestore();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    dispatch({ type: 'SET_LOADING' });
    const result = await authService.login(data);
    const user = await authService.getCurrentUser(result.accessToken);
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: {
        user,
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
      },
    });
  }, []);

  const logout = useCallback(async () => {
    if (state.accessToken) {
      await authService.logout(state.accessToken).catch(() => {});
    }
    dispatch({ type: 'LOGOUT' });
  }, [state.accessToken]);

  const getAccessToken = useCallback(() => state.accessToken, [state.accessToken]);

  useEffect(() => {
    configureHttpClient({
      getAccessToken,
      refresh: async () => {
        try { const result = await authService.refresh(); dispatch({ type: 'REFRESH_SUCCESS', payload: { accessToken: result.accessToken, expiresAt: Date.now() + result.expiresIn * 1000 } }); return result.accessToken; }
        catch { return null; }
      },
      onUnauthenticated: () => dispatch({ type: 'SET_UNAUTHENTICATED' }),
    });
    return () => configureHttpClient(null);
  }, [getAccessToken]);

  return (
    <AuthContext.Provider value={{ state, login, logout, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ───────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext phải được dùng bên trong AuthProvider.');
  return ctx;
}
