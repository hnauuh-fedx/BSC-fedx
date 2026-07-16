import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RequestWithCorrelation, redactText, resolveCorrelationId } from '../observability/request-context';
import { ErrorMonitor, NoopErrorMonitor } from '../observability/error-monitor';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  constructor(private readonly monitor: ErrorMonitor = new NoopErrorMonitor()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<RequestWithCorrelation>();
    const path = request?.path ?? request?.url?.split('?')[0] ?? request?.originalUrl?.split('?')[0] ?? '';
    const correlationId = request.correlationId ?? resolveCorrelationId(request.headers?.['x-correlation-id']);

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const responseBody = this.normalizeHttpException(exception, path, statusCode, correlationId);
      request.errorCode = responseBody.code;

      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logServerError(exception, request?.method ?? 'HTTP', path, correlationId, statusCode);
      }

      response.status(statusCode).json(responseBody);
      return;
    }

    request.errorCode = 'INTERNAL_SERVER_ERROR';
    this.logServerError(exception, request?.method ?? 'HTTP', path, correlationId, HttpStatus.INTERNAL_SERVER_ERROR);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '\u004C\u1ED7i h\u1EC7 th\u1ED1ng',
      details: [],
      timestamp: new Date().toISOString(),
      path,
      correlationId,
    });
  }

  private logServerError(exception: unknown, method: string, path: string, correlationId: string, statusCode: number): void {
    const stack = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
    const safeError = { name: exception instanceof Error ? exception.name : 'UnknownError', message: redactText(exception instanceof Error ? exception.message : String(exception)), stack: redactText(stack) };
    this.monitor.capture({ correlationId, method, path, statusCode, error: safeError });
    this.logger.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', correlationId, method, path, statusCode, stack: safeError.stack }));
  }

  private normalizeHttpException(exception: HttpException, path: string, statusCode: number, correlationId: string) {
    const response = exception.getResponse();
    const isValidationError = statusCode === HttpStatus.BAD_REQUEST;

    if (typeof response === 'string') {
      return this.buildResponse({
        statusCode,
        code: this.mapCode(statusCode, isValidationError),
        message: isValidationError ? '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7' : response,
        details: [],
        path,
        correlationId,
      });
    }

    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      const details = Array.isArray(body.details) ? body.details : [];
      const message = isValidationError
        ? '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7'
        : typeof body.message === 'string'
          ? body.message
          : exception.message;

      return this.buildResponse({
        statusCode,
        code: typeof body.code === 'string' ? body.code : this.mapCode(statusCode, isValidationError),
        message,
        details: isValidationError && details.length === 0 && Array.isArray(body.message)
          ? body.message
          : details,
        path,
        correlationId,
      });
    }

    return this.buildResponse({
      statusCode,
      code: this.mapCode(statusCode, isValidationError),
      message: isValidationError ? '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7' : exception.message,
      details: [],
      path,
      correlationId,
    });
  }

  private buildResponse(payload: {
    statusCode: number;
    code: string;
    message: string;
    details: unknown[];
    path: string;
    correlationId: string;
  }) {
    return {
      ...payload,
      timestamp: new Date().toISOString(),
    };
  }

  private mapCode(statusCode: number, isValidationError: boolean): string {
    if (isValidationError) {
      return 'VALIDATION_ERROR';
    }

    switch (statusCode) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'HTTP_ERROR';
    }
  }
}
