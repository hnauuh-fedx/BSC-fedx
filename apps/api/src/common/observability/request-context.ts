import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SENSITIVE_KEYS = new Set(['authorization', 'cookie', 'setcookie', 'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'secret', 'databaseurl', 'snapshot', 'evidence', 'headers', 'credential', 'credentials']);

export type RequestWithCorrelation = Request & { correlationId?: string; errorCode?: string; user?: { id?: string } };

export function resolveCorrelationId(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && SAFE_CORRELATION_ID.test(candidate) ? candidate : randomUUID();
}

export function sanitizeForLog(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, sanitizeForLog(child, childKey)]));
  }
  return typeof value === 'string' ? redactText(value) : value;
}

export function redactText(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|secret|cookie)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function requestContextMiddleware(logger = new Logger('HttpRequest')) {
  return (request: RequestWithCorrelation, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    request.correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
    response.setHeader('x-correlation-id', request.correlationId);
    response.on('finish', () => {
      if (request.path.startsWith('/health') && response.statusCode < 500) return;
      const entry = sanitizeForLog({
        timestamp: new Date().toISOString(),
        level: response.statusCode >= 500 ? 'error' : 'info',
        correlationId: request.correlationId,
        method: request.method,
        route: request.route?.path ?? request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        actorId: request.user?.id ?? null,
        errorCode: request.errorCode ?? null,
      });
      const line = JSON.stringify(entry);
      response.statusCode >= 500 ? logger.error(line) : logger.log(line);
    });
    next();
  };
}
