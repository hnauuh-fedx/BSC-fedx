import React, { PropsWithChildren } from 'react';
import { SystemConfirmDialogProvider } from '../../components/system-confirm-dialog';
import { AuthProvider } from '../store/auth-store';
import { Toaster } from '../../components/ui/sonner';
import { AppearanceThemeSync } from '../../features/account/appearance-theme';

export const AppProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <AuthProvider>
      <AppearanceThemeSync />
      <SystemConfirmDialogProvider>
        {children}
        <Toaster position="top-right" closeButton />
      </SystemConfirmDialogProvider>
    </AuthProvider>
  );
};
