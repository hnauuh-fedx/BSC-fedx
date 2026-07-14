import fs from 'node:fs';
import path from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppEnvironment {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  corsOrigin: string;
}

const REQUIRED_KEYS = [
  'NODE_ENV',
  'API_PORT',
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'CORS_ORIGIN',
] as const;

export function loadLocalEnvironment(): void {
  const envPath = resolveLocalEnvPath();
  if (!envPath) {
    return;
  }

  const fileContents = fs.readFileSync(envPath, 'utf8');
  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const missing = REQUIRED_KEYS.filter((key) => isBlank(env[key]));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const apiPort = Number(env.API_PORT);
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error('API_PORT must be a positive integer');
  }

  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);

  return {
    nodeEnv,
    apiPort,
    databaseUrl: String(env.DATABASE_URL),
    jwtAccessSecret: String(env.JWT_ACCESS_SECRET),
    jwtRefreshSecret: String(env.JWT_REFRESH_SECRET),
    jwtAccessExpiresIn: String(env.JWT_ACCESS_EXPIRES_IN),
    jwtRefreshExpiresIn: String(env.JWT_REFRESH_EXPIRES_IN),
    corsOrigin: String(env.CORS_ORIGIN),
  };
}

function normalizeNodeEnv(value: string | undefined): NodeEnvironment {
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error('NODE_ENV must be one of development, test, or production');
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function resolveLocalEnvPath(): string | null {
  const repositoryRoot = findRepositoryRoot(process.cwd()) ?? findRepositoryRoot(__dirname);
  if (!repositoryRoot) {
    return null;
  }

  const envPath = path.join(repositoryRoot, '.env');
  return fs.existsSync(envPath) ? envPath : null;
}

function findRepositoryRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const appsDir = path.join(currentDir, 'apps');
    const packagesDir = path.join(currentDir, 'packages');

    if (fs.existsSync(packageJsonPath) && fs.existsSync(appsDir) && fs.existsSync(packagesDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
