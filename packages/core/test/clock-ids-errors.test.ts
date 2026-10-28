import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ExchangeError, ManualClock, ageMs, isUuidV4, newId, parseId, toPublicError } from '../src';

describe('ManualClock', () => {
  it('двигается только вперёд и считает возраст наблюдения', () => {
    const clock = new ManualClock('2026-10-28T10:00:00.000Z');
    const observedAt = clock.now();
    clock.advance(90_000);
    expect(ageMs(clock, observedAt)).toBe(90_000);
    expect(() => clock.advance(-1)).toThrow();
  });

  it('отрицательный возраст показывает дрейф часов (EC-041)', () => {
    const clock = new ManualClock('2026-10-28T10:00:00.000Z');
    expect(ageMs(clock, new Date('2026-10-28T10:00:05.000Z'))).toBeLessThan(0);
  });
});

describe('Идентификаторы', () => {
  it('UUID v4, непоследовательные', () => {
    const a = newId<'Order'>();
    const b = newId<'Order'>();
    expect(isUuidV4(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(parseId<'Order'>('1')).toBeNull();
  });
});

describe('Коды ошибок', () => {
  it('всё, что могло создать денежный эффект, не помечено как безопасное для повтора (02 §11)', () => {
    for (const code of ['UNKNOWN_RESULT', 'UI_UNRECOGNIZED', 'AUTH_REQUIRED', 'REVIEW_REQUIRED'] as const) {
      expect(ERROR_CODES[code].retryable).toBe(false);
    }
  });

  it('публичная ошибка не раскрывает внутренний текст и stack', () => {
    const internal = toPublicError(new Error('db password=hunter2 at line 42'), 'corr-12345678');
    expect(internal).toEqual({
      code: 'INTERNAL',
      message: 'INTERNAL',
      correlationId: 'corr-12345678',
      retryable: false,
    });
  });

  it('публичная ошибка домена сохраняет код и флаг повтора', () => {
    const pub = toPublicError(new ExchangeError('UNKNOWN_RESULT', 'Исход не установлен'), 'corr-12345678', {
      knownState: 'OUTBOUND_SUBMITTED',
    });
    expect(pub.code).toBe('UNKNOWN_RESULT');
    expect(pub.retryable).toBe(false);
    expect(pub.knownState).toBe('OUTBOUND_SUBMITTED');
  });
});
