import { AppEnvironment, validateEnvironment } from './env.validation';

export interface DatabaseConfig {
  databaseUrl: string;
}

export function getDatabaseConfig(env: AppEnvironment = validateEnvironment()): DatabaseConfig {
  return {
    databaseUrl: env.databaseUrl,
  };
}
