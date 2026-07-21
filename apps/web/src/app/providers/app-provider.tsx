import React, { PropsWithChildren } from 'react';
import { SystemConfirmDialogProvider } from '../../components/system-confirm-dialog';
import { AuthProvider } from '../store/auth-store';

export const AppProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return <AuthProvider><SystemConfirmDialogProvider>{children}</SystemConfirmDialogProvider></AuthProvider>;
};
