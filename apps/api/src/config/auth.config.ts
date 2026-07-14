import { AppEnvironment, validateEnvironment } from './env.validation';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export function getAuthConfig(env: AppEnvironment = validateEnvironment()): AuthConfig {
  return {
    accessSecret: env.jwtAccessSecret,
    refreshSecret: env.jwtRefreshSecret,
    accessExpiresIn: env.jwtAccessExpiresIn,
    refreshExpiresIn: env.jwtRefreshExpiresIn,
  };
}
