import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  ExchangeError,
  currentCorrelationId,
  normalizeCorrelationId,
  toPublicError,
  type ErrorCode,
  type Logger,
} from '@raffle-exchange/core';

const HTTP_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT_VERSION',
  429: 'RATE_LIMITED',
};

/**
 * Единый формат ошибки (02 §11): стабильный code, correlationId, retryable.
 * Stack, raw payload и внутренний текст наружу не уходят.
 */
@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = currentCorrelationId() ?? normalizeCorrelationId(undefined);

    let error: unknown = exception;
    let status = 500;
    if (exception instanceof ExchangeError) {
      status = exception.httpStatus;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = HTTP_TO_CODE[status];
      if (code) error = new ExchangeError(code, code);
    }

    if (status >= 500) {
      this.logger.error({ err: exception }, 'request failed');
    }
    res.status(status).json(toPublicError(error, correlationId));
  }
}
