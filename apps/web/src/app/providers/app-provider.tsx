import React, { PropsWithChildren } from 'react';
import { SystemConfirmDialogProvider } from '../../components/system-confirm-dialog';
import { AuthProvider } from '../store/auth-store';
import { Toaster } from '../../components/ui/sonner';

export const AppProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <AuthProvider>
      <SystemConfirmDialogProvider>
        {children}
        <Toaster position="top-right" closeButton />
      </SystemConfirmDialogProvider>
    </AuthProvider>
  );
};
