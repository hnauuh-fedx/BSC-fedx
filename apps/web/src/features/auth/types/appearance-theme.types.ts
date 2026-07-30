export const APPEARANCE_THEMES = ['DEFAULT', 'REMY'] as const;

export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];
