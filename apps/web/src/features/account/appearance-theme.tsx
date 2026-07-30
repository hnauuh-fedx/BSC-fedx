import React, { useEffect } from 'react';
import { useAuth } from '../auth/hooks/use-auth';
import type { AppearanceTheme } from '../auth/types/appearance-theme.types';

export type { AppearanceTheme } from '../auth/types/appearance-theme.types';

export const DEFAULT_APPEARANCE_THEME: AppearanceTheme = 'DEFAULT';

export const APPEARANCE_THEME_OPTIONS: ReadonlyArray<{
  value: AppearanceTheme;
  label: string;
  colorCode: string;
  description: string;
}> = [
  {
    value: 'DEFAULT',
    label: 'Mặc định',
    colorCode: '#F6F5F4',
    description: 'Màu giao diện hiện tại của hệ thống.',
  },
  {
    value: 'REMY',
    label: 'Remy',
    colorCode: '#FFECF2',
    description: 'Nền hồng nhẹ đồng bộ với nhận diện BSC.',
  },
];

export function normalizeAppearanceTheme(value: string | null | undefined): AppearanceTheme {
  return value === 'REMY' ? 'REMY' : DEFAULT_APPEARANCE_THEME;
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  if (theme === DEFAULT_APPEARANCE_THEME) {
    delete document.documentElement.dataset.colorTheme;
    return;
  }
  document.documentElement.dataset.colorTheme = theme.toLowerCase();
}

export const AppearanceThemeSync: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    applyAppearanceTheme(normalizeAppearanceTheme(user?.appearanceTheme));
  }, [user?.appearanceTheme]);

  return null;
};
