/**
 * Логгер на pino с обязательным редактированием (T0.3).
 * Все поля проходят через `redact`, строка сообщения — через `scrubString`.
 */
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { currentCorrelationId } from './correlation';
import { redact, scrubString } from './redact';

export type { Logger };

export interface CreateLoggerOptions {
  readonly name: string;
  readonly level?: LoggerOptions['level'];
  /** Для тестов: куда писать вместо stdout. */
  readonly destination?: DestinationStream;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const config: LoggerOptions = {
    name: options.name,
    level: options.level ?? 'info',
    base: { service: options.name },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'msg',
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => {
        const correlationId = currentCorrelationId();
        const cleaned = redact(object) as Record<string, unknown>;
        return correlationId ? { correlationId, ...cleaned } : cleaned;
      },
    },
    hooks: {
      logMethod(args, method) {
        const scrubbed = args.map((arg) => (typeof arg === 'string' ? scrubString(arg) : arg));
        method.apply(this, scrubbed as Parameters<typeof method>);
      },
    },
  };
  return options.destination ? pino(config, options.destination) : pino(config);
}
