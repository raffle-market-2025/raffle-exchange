/**
 * Денежный тип обмена (T0.3).
 *
 * Правила (02 §9, 02 §10, EX-014, EX-015):
 * - суммы только в десятичной арифметике; JS `number` не принимается ни на входе, ни на выходе;
 * - масштаб (scale) задаётся по активу явно; неизвестный актив или не заданный масштаб — ошибка;
 * - лишняя дробность отклоняется, а не округляется молча;
 * - операции между разными активами запрещены — USDT нельзя «сбалансировать» гривнами;
 * - перевод по курсу всегда с явным режимом округления и возвращает остаток округления,
 *   чтобы его можно было провести отдельной проводкой.
 */
import Decimal from 'decimal.js';
import { ExchangeError } from './errors';

/** Изолированная копия Decimal, чтобы глобальная настройка где-то ещё не меняла поведение денег. */
const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -60, toExpPos: 60 });
type Dec = InstanceType<typeof D>;

export const ASSETS = ['UAH', 'USDT'] as const;
export type Asset = (typeof ASSETS)[number];

export type AssetScales = Readonly<Record<Asset, number>>;

/** Режим округления указывается всегда явно: молчаливого режима по умолчанию нет. */
export type RoundingMode = 'DOWN' | 'UP' | 'HALF_UP';

const ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  DOWN: D.ROUND_DOWN,
  UP: D.ROUND_UP,
  HALF_UP: D.ROUND_HALF_UP,
};

const DECIMAL_STRING = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Значение, из которого можно построить деньги или курс. `number` намеренно не входит. */
export type DecimalInput = string | Dec;

export function isAsset(value: unknown): value is Asset {
  return typeof value === 'string' && (ASSETS as readonly string[]).includes(value);
}

function parseDecimal(value: unknown, what: string): Dec {
  if (value instanceof D) return value;
  if (typeof value !== 'string') {
    throw new ExchangeError('VALIDATION_FAILED', `${what}: ожидается десятичная строка, получено ${typeof value}`);
  }
  if (!DECIMAL_STRING.test(value)) {
    throw new ExchangeError('VALIDATION_FAILED', `${what}: недопустимый формат десятичной строки`);
  }
  return new D(value);
}

/** Курс или коэффициент: десятичная строка без ограничения масштаба, строго положительная. */
export function rate(value: DecimalInput): Dec {
  const parsed = parseDecimal(value, 'rate');
  if (!parsed.isPositive() || parsed.isZero()) {
    throw new ExchangeError('VALIDATION_FAILED', 'rate: курс должен быть больше нуля');
  }
  return parsed;
}

export class Money {
  private constructor(
    readonly asset: Asset,
    readonly scale: number,
    private readonly amount: Dec,
  ) {}

  /** @internal Используется только фабрикой. */
  static create(asset: Asset, scale: number, amount: Dec): Money {
    if (amount.decimalPlaces() > scale) {
      throw new ExchangeError(
        'PRECISION_EXCEEDED',
        `${asset}: допустимо не более ${scale} знаков после запятой`,
      );
    }
    // -0 нормализуется в 0, чтобы сравнения и строки были однозначными.
    return new Money(asset, scale, amount.isZero() ? new D(0) : amount);
  }

  private assertSameAsset(other: Money): void {
    if (other.asset !== this.asset || other.scale !== this.scale) {
      throw new ExchangeError(
        'ASSET_MISMATCH',
        `Операция между ${this.asset}(scale ${this.scale}) и ${other.asset}(scale ${other.scale}) запрещена`,
      );
    }
  }

  plus(other: Money): Money {
    this.assertSameAsset(other);
    return Money.create(this.asset, this.scale, this.amount.plus(other.amount));
  }

  minus(other: Money): Money {
    this.assertSameAsset(other);
    return Money.create(this.asset, this.scale, this.amount.minus(other.amount));
  }

  negate(): Money {
    return Money.create(this.asset, this.scale, this.amount.negated());
  }

  abs(): Money {
    return Money.create(this.asset, this.scale, this.amount.abs());
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameAsset(other);
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1;
  }

  eq(other: Money): boolean {
    return this.compare(other) === 0;
  }

  lt(other: Money): boolean {
    return this.compare(other) < 0;
  }

  lte(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  gt(other: Money): boolean {
    return this.compare(other) > 0;
  }

  gte(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  /** Точное десятичное значение для расчётов в домене (не для вывода). */
  toDecimal(): Dec {
    return this.amount;
  }

  /** Строка с фиксированным масштабом актива: "4200.00". */
  toString(): string {
    return this.amount.toFixed(this.scale);
  }

  toJSON(): { asset: Asset; amount: string } {
    return { asset: this.asset, amount: this.toString() };
  }

  /** Не даёт случайно превратить деньги в number через арифметику или сравнение `<`. */
  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'number') {
      throw new ExchangeError('VALIDATION_FAILED', 'Money нельзя преобразовать в number');
    }
    return `${this.toString()} ${this.asset}`;
  }
}

export interface ConversionResult {
  /** Округлённая сумма в целевом активе. */
  readonly value: Money;
  /** Точное значение минус округлённое, в единицах целевого актива. Проводится отдельно (EX-015). */
  readonly remainder: Dec;
}

export class MoneyFactory {
  private readonly scales: AssetScales;

  constructor(scales: Partial<Record<Asset, number>>) {
    const resolved = {} as Record<Asset, number>;
    for (const asset of ASSETS) {
      const scale = scales[asset];
      if (scale === undefined) {
        throw new ExchangeError('CONFIG_MISSING', `Не задан масштаб для актива ${asset}`);
      }
      if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
        throw new ExchangeError('VALIDATION_FAILED', `Недопустимый масштаб ${asset}: ${scale}`);
      }
      resolved[asset] = scale;
    }
    this.scales = Object.freeze(resolved);
  }

  scaleOf(asset: Asset): number {
    return this.scales[asset];
  }

  of(asset: Asset, value: DecimalInput): Money {
    if (!isAsset(asset)) {
      throw new ExchangeError('VALIDATION_FAILED', 'Неизвестный актив');
    }
    return Money.create(asset, this.scales[asset], parseDecimal(value, asset));
  }

  zero(asset: Asset): Money {
    return this.of(asset, '0');
  }

  /** amount × rate → целевой актив. Например, USDT × (UAH/USDT) → UAH. */
  multiply(amount: Money, by: DecimalInput, to: Asset, rounding: RoundingMode): ConversionResult {
    return this.round(amount.toDecimal().times(rate(by)), to, rounding);
  }

  /** amount ÷ rate → целевой актив. Например, UAH ÷ (UAH/USDT) → USDT. */
  divide(amount: Money, by: DecimalInput, to: Asset, rounding: RoundingMode): ConversionResult {
    return this.round(amount.toDecimal().dividedBy(rate(by)), to, rounding);
  }

  private round(exact: Dec, to: Asset, rounding: RoundingMode): ConversionResult {
    const scale = this.scales[to];
    const rounded = exact.toDecimalPlaces(scale, ROUNDING[rounding]);
    return { value: Money.create(to, scale, rounded), remainder: exact.minus(rounded) };
  }

  /** Сумма списка одного актива; пустой список даёт ноль этого актива. */
  sum(asset: Asset, items: readonly Money[]): Money {
    return items.reduce((acc, item) => acc.plus(item), this.zero(asset));
  }
}

export { D as DecimalValue };
export type { Dec as DecimalType };
