import { AppEnvironment, validateEnvironment } from './env.validation';

export interface AppConfig {
  nodeEnv: AppEnvironment['nodeEnv'];
  apiPort: number;
  corsOrigins: string[];
  isProduction: boolean;
  trustProxy: number;
  logLevel: AppEnvironment['logLevel'];
}

export function getAppConfig(env: AppEnvironment = validateEnvironment()): AppConfig {
  return {
    nodeEnv: env.nodeEnv,
    apiPort: env.apiPort,
    corsOrigins: env.corsOrigins,
    isProduction: env.nodeEnv === 'production',
    trustProxy: env.trustProxy,
    logLevel: env.logLevel,
  };
}
