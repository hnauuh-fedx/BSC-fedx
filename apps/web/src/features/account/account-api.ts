import type { AuthUser } from '../auth/types/auth.types';
import type { AppearanceTheme } from './appearance-theme';
import { httpClient } from '../../lib/http-client';

export const accountApi = {
  updateProfile: (data: { fullName: string }) =>
    httpClient.patch<AuthUser>('/auth/me/profile', data),
  updatePreferences: (data: { appearanceTheme: AppearanceTheme }) =>
    httpClient.patch<AuthUser>('/auth/me/preferences', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    httpClient.post<{ reauthenticate: true }>('/auth/me/change-password', data),
};
