import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { normalizeCorrelationId, withCorrelation } from '@raffle-exchange/core';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Каждому запросу — correlationId: принятый из заголовка в безопасном формате или новый. */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = normalizeCorrelationId(req.header(CORRELATION_HEADER));
    res.setHeader(CORRELATION_HEADER, correlationId);
    withCorrelation(correlationId, () => next());
  }
}
