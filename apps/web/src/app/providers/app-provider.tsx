import React, { PropsWithChildren } from 'react';
import { AuthProvider } from '../store/auth-store';

export const AppProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return <AuthProvider>{children}</AuthProvider>;
};
