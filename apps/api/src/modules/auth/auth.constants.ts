export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  REFRESH_REVOKED: 'AUTH_REFRESH_REVOKED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];

/** Mặc định: tối đa 5 lần thất bại trong 15 phút mỗi IP+email */
export const RATE_LIMIT_DEFAULTS = {
  MAX_ATTEMPTS: Number(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 5,
  WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
} as const;

export const COOKIE_NAME = 'refresh_token' as const;
export const COOKIE_PATH = '/auth' as const;
