import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAppearanceTheme,
  normalizeAppearanceTheme,
} from './appearance-theme';

describe('appearance theme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.colorTheme;
  });

  it('applies Remy and removes the attribute for the default theme', () => {
    applyAppearanceTheme('REMY');
    expect(document.documentElement).toHaveAttribute('data-color-theme', 'remy');

    applyAppearanceTheme('DEFAULT');
    expect(document.documentElement).not.toHaveAttribute('data-color-theme');
  });

  it('falls back to the default theme for missing or legacy values', () => {
    expect(normalizeAppearanceTheme(undefined)).toBe('DEFAULT');
    expect(normalizeAppearanceTheme('UNSUPPORTED')).toBe('DEFAULT');
  });
});
