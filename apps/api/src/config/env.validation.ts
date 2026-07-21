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
  corsOrigins: string[];
  refreshCookieSameSite: 'lax' | 'strict' | 'none';
  trustProxy: number;
  logLevel: 'error' | 'warn' | 'log' | 'debug';
}

const REQUIRED_KEYS = [
  'NODE_ENV',
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
  const missing: string[] = REQUIRED_KEYS.filter((key) => isBlank(env[key]));
  if (isBlank(env.API_PORT) && isBlank(env.PORT)) {
    missing.push('API_PORT or PORT');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const portKey = isBlank(env.API_PORT) ? 'PORT' : 'API_PORT';
  const apiPort = Number(env[portKey]);
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error(`${portKey} must be a positive integer`);
  }

  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
  const databaseUrl = String(env.DATABASE_URL);
  const databaseName = parseDatabaseName(databaseUrl);
  const accessSecret = String(env.JWT_ACCESS_SECRET);
  const refreshSecret = String(env.JWT_REFRESH_SECRET);
  const corsOrigins = String(env.CORS_ORIGIN).split(',').map((item) => item.trim()).filter(Boolean);
  const accessExpiresIn = String(env.JWT_ACCESS_EXPIRES_IN);
  const refreshExpiresIn = String(env.JWT_REFRESH_EXPIRES_IN);
  const refreshCookieSameSite = normalizeSameSite(env.REFRESH_COOKIE_SAME_SITE);
  const trustProxy = Number(env.TRUST_PROXY ?? 0);
  const logLevel = env.LOG_LEVEL === 'debug' ? 'debug' : env.LOG_LEVEL === 'warn' ? 'warn' : env.LOG_LEVEL === 'error' ? 'error' : 'log';
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10) throw new Error('TRUST_PROXY must be an integer from 0 to 10');
  validateExpiry('JWT_ACCESS_EXPIRES_IN', accessExpiresIn);
  validateExpiry('JWT_REFRESH_EXPIRES_IN', refreshExpiresIn);

  if (nodeEnv === 'test' && databaseName === 'bsc_db') {
    throw new Error('Test environment must never use bsc_db');
  }
  if (nodeEnv !== 'production' && refreshCookieSameSite === 'none') {
    throw new Error('REFRESH_COOKIE_SAME_SITE=none requires production HTTPS');
  }
  if (nodeEnv === 'production') {
    if (!env.REFRESH_COOKIE_SAME_SITE) throw new Error('REFRESH_COOKIE_SAME_SITE must be explicitly configured in production');
    validateProductionSecret('JWT_ACCESS_SECRET', accessSecret);
    validateProductionSecret('JWT_REFRESH_SECRET', refreshSecret);
    if (accessSecret === refreshSecret) throw new Error('JWT access and refresh secrets must be different in production');
    if (env.TRUST_PROXY === undefined) throw new Error('TRUST_PROXY must be explicitly configured in production');
    if (env.LOG_LEVEL !== undefined && !['error', 'warn', 'info', 'log', 'debug'].includes(env.LOG_LEVEL)) throw new Error('LOG_LEVEL is invalid');
    if (databaseName === 'bsc_db') throw new Error('Production database must use an explicit environment-specific name, not bsc_db');
    if (/(^|[_-])test($|[_-])/.test(databaseName)) throw new Error('Production must not use a test database');
    if (corsOrigins.includes('*')) {
      throw new Error('CORS_ORIGIN cannot be wildcard when credentials are enabled');
    }
    for (const origin of corsOrigins) {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:') throw new Error('Production CORS_ORIGIN must use HTTPS');
      if (parsed.origin !== origin.replace(/\/$/, '')) throw new Error('CORS_ORIGIN entries must be origins without paths, queries, or fragments');
    }
  }

  return {
    nodeEnv,
    apiPort,
    databaseUrl,
    jwtAccessSecret: accessSecret,
    jwtRefreshSecret: refreshSecret,
    jwtAccessExpiresIn: accessExpiresIn,
    jwtRefreshExpiresIn: refreshExpiresIn,
    corsOrigins,
    refreshCookieSameSite,
    trustProxy,
    logLevel,
  };
}

function parseDatabaseName(databaseUrl: string): string {
  try { return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, '')).toLowerCase(); }
  catch { throw new Error('DATABASE_URL must be a valid URL'); }
}

function validateProductionSecret(key: string, value: string): void {
  if (value.length < 32 || /change[-_ ]?me|placeholder|example|secret/i.test(value)) {
    throw new Error(`${key} must be a non-placeholder secret of at least 32 characters in production`);
  }
}

function validateExpiry(key: string, value: string): void {
  if (!/^[1-9]\d*(s|m|h|d)$/.test(value)) throw new Error(`${key} must be a positive duration using s, m, h, or d`);
}

function normalizeSameSite(value: string | undefined): 'lax' | 'strict' | 'none' {
  const normalized = value?.trim().toLowerCase() ?? 'lax';
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') return normalized;
  throw new Error('REFRESH_COOKIE_SAME_SITE must be lax, strict, or none');
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
