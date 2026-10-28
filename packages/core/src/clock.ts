/**
 * Источник времени (T0.3).
 *
 * Весь код получает время только через Clock, никогда через `new Date()` / `Date.now()` напрямую.
 * Иначе нельзя проверить дедлайны, TTL, дрейф часов и устаревшие наблюдения (EC-009, EC-041).
 * Внутри системы время — UTC (02 §10).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Управляемые часы для тестов и сценариев. */
export class ManualClock implements Clock {
  private current: number;

  constructor(start: Date | string) {
    const value = typeof start === 'string' ? Date.parse(start) : start.getTime();
    if (Number.isNaN(value)) throw new Error('ManualClock: некорректное начальное время');
    this.current = value;
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new Error('ManualClock: время только вперёд');
    this.current += ms;
  }

  set(at: Date | string): void {
    const value = typeof at === 'string' ? Date.parse(at) : at.getTime();
    if (Number.isNaN(value)) throw new Error('ManualClock: некорректное время');
    this.current = value;
  }
}

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/** Возраст наблюдения в мс относительно часов; отрицательный возраст — признак дрейфа (EC-041). */
export function ageMs(clock: Clock, observedAt: Date): number {
  return clock.now().getTime() - observedAt.getTime();
}
