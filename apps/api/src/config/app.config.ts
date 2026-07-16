import { AppEnvironment, validateEnvironment } from './env.validation';

export interface AppConfig {
  nodeEnv: AppEnvironment['nodeEnv'];
  apiPort: number;
  corsOrigin: string;
  isProduction: boolean;
  trustProxy: number;
  logLevel: AppEnvironment['logLevel'];
}

export function getAppConfig(env: AppEnvironment = validateEnvironment()): AppConfig {
  return {
    nodeEnv: env.nodeEnv,
    apiPort: env.apiPort,
    corsOrigin: env.corsOrigin,
    isProduction: env.nodeEnv === 'production',
    trustProxy: env.trustProxy,
    logLevel: env.logLevel,
  };
}
