import type { AuthUser } from '../auth/types/auth.types';
import { httpClient } from '../../lib/http-client';

export const accountApi = {
  updateProfile: (data: { fullName: string }) =>
    httpClient.patch<AuthUser>('/auth/me/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    httpClient.post<{ reauthenticate: true }>('/auth/me/change-password', data),
};
