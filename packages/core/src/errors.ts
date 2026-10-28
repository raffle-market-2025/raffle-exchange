/**
 * Стабильные коды ошибок (02 §11, 07 §3, 06 §2).
 *
 * Код — часть контракта: его не переименовывают и не переиспользуют с другим смыслом.
 * `retryable` описывает, безопасен ли автоматический повтор ТОГО ЖЕ запроса.
 * Для всего, что могло создать денежный эффект, повтор запрещён (02 §8, 02 §11).
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: { retryable: false, httpStatus: 400 },
  UNAUTHENTICATED: { retryable: false, httpStatus: 401 },
  FORBIDDEN: { retryable: false, httpStatus: 403 },
  NOT_FOUND: { retryable: false, httpStatus: 404 },
  CONFLICT_VERSION: { retryable: true, httpStatus: 409 },
  ASSET_MISMATCH: { retryable: false, httpStatus: 400 },
  PRECISION_EXCEEDED: { retryable: false, httpStatus: 400 },
  CONFIG_MISSING: { retryable: false, httpStatus: 503 },
  EMERGENCY_STOP_ACTIVE: { retryable: false, httpStatus: 503 },
  CAPABILITY_UNVERIFIED: { retryable: false, httpStatus: 409 },
  HUMAN_CONFIRMATION_REQUIRED: { retryable: false, httpStatus: 409 },
  REVIEW_REQUIRED: { retryable: false, httpStatus: 409 },
  // Коды браузерных адаптеров (07 §3). Ни один не означает финансового успеха.
  UI_UNRECOGNIZED: { retryable: false, httpStatus: 502 },
  ACTION_UNAVAILABLE: { retryable: false, httpStatus: 409 },
  AUTH_REQUIRED: { retryable: false, httpStatus: 503 },
  UNKNOWN_RESULT: { retryable: false, httpStatus: 502 },
  PROVIDER_UNAVAILABLE: { retryable: true, httpStatus: 503 },
  RATE_LIMITED: { retryable: true, httpStatus: 429 },
  INTERNAL: { retryable: false, httpStatus: 500 },
} as const satisfies Record<string, { retryable: boolean; httpStatus: number }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CODES, value);
}

export class ExchangeError extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'ExchangeError';
    this.retryable = ERROR_CODES[code].retryable;
    this.httpStatus = ERROR_CODES[code].httpStatus;
  }
}

/** Публичная форма ошибки (02 §11): без stack, raw payload и внутренних деталей. */
export interface PublicError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly correlationId: string;
  readonly retryable: boolean;
  readonly knownState?: string;
}

export function toPublicError(
  error: unknown,
  correlationId: string,
  options: { knownState?: string; exposeMessage?: boolean } = {},
): PublicError {
  const base =
    error instanceof ExchangeError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : { code: 'INTERNAL' as const, message: 'Внутренняя ошибка', retryable: false };
  return {
    code: base.code,
    // Текст внутренних ошибок наружу не отдаётся; локализуемое сообщение подставляет слой API.
    message: options.exposeMessage === false || base.code === 'INTERNAL' ? base.code : base.message,
    correlationId,
    retryable: base.retryable,
    ...(options.knownState !== undefined ? { knownState: options.knownState } : {}),
  };
}
