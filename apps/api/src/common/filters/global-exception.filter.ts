import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const path = request?.url ?? request?.originalUrl ?? '';

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const responseBody = this.normalizeHttpException(exception, path, statusCode);

      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `${request?.method ?? 'HTTP'} ${path}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      }

      response.status(statusCode).json(responseBody);
      return;
    }

    this.logger.error(
      `${request?.method ?? 'HTTP'} ${path}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '\u004C\u1ED7i h\u1EC7 th\u1ED1ng',
      details: [],
      timestamp: new Date().toISOString(),
      path,
    });
  }

  private normalizeHttpException(exception: HttpException, path: string, statusCode: number) {
    const response = exception.getResponse();
    const isValidationError = statusCode === HttpStatus.BAD_REQUEST;

    if (typeof response === 'string') {
      return this.buildResponse({
        statusCode,
        code: this.mapCode(statusCode, isValidationError),
        message: isValidationError ? '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7' : response,
        details: [],
        path,
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
      });
    }

    return this.buildResponse({
      statusCode,
      code: this.mapCode(statusCode, isValidationError),
      message: isValidationError ? '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7' : exception.message,
      details: [],
      path,
    });
  }

  private buildResponse(payload: {
    statusCode: number;
    code: string;
    message: string;
    details: unknown[];
    path: string;
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
