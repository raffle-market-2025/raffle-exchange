import { describe, expect, it } from 'vitest';
import { ExchangeError, MoneyFactory, rate } from '../src';

const money = new MoneyFactory({ UAH: 2, USDT: 6 });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ExchangeError ? error.code : 'NOT_EXCHANGE_ERROR';
  }
  return undefined;
}

describe('MoneyFactory: конфигурация масштаба', () => {
  it('без масштаба для актива не создаётся', () => {
    expect(codeOf(() => new MoneyFactory({ UAH: 2 }))).toBe('CONFIG_MISSING');
  });

  it('отклоняет нецелый и отрицательный масштаб', () => {
    expect(codeOf(() => new MoneyFactory({ UAH: 2.5, USDT: 6 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => new MoneyFactory({ UAH: -1, USDT: 6 }))).toBe('VALIDATION_FAILED');
  });
});

describe('Money: ввод', () => {
  it('принимает каноническую десятичную строку и выводит с масштабом актива', () => {
    expect(money.of('UAH', '4200').toString()).toBe('4200.00');
    expect(money.of('USDT', '100.5').toString()).toBe('100.500000');
  });

  it('не принимает number', () => {
    // @ts-expect-error number запрещён типом
    expect(codeOf(() => money.of('UAH', 4200))).toBe('VALIDATION_FAILED');
  });

  it.each(['1e3', '+1', ' 1', '1,5', '01.5', '.5', '5.', 'NaN', 'Infinity', ''])(
    'отклоняет неканоническую строку %j',
    (value) => {
      expect(codeOf(() => money.of('UAH', value))).toBe('VALIDATION_FAILED');
    },
  );

  it('лишнюю дробность отклоняет, а не округляет', () => {
    expect(codeOf(() => money.of('UAH', '0.001'))).toBe('PRECISION_EXCEEDED');
    expect(codeOf(() => money.of('USDT', '0.0000001'))).toBe('PRECISION_EXCEEDED');
  });

  it('неизвестный актив отклоняется', () => {
    // @ts-expect-error актив вне USDT/UAH
    expect(codeOf(() => money.of('USD', '1'))).toBe('VALIDATION_FAILED');
  });
});

describe('Money: арифметика', () => {
  it('складывает без потерь точности, где float ошибается', () => {
    const sum = money.of('USDT', '0.1').plus(money.of('USDT', '0.2'));
    expect(sum.toString()).toBe('0.300000');
  });

  it('запрещает операции между UAH и USDT', () => {
    expect(codeOf(() => money.of('UAH', '1').plus(money.of('USDT', '1')))).toBe('ASSET_MISMATCH');
    expect(codeOf(() => money.of('UAH', '1').compare(money.of('USDT', '1')))).toBe('ASSET_MISMATCH');
  });

  it('запрещает неявное превращение в number', () => {
    const a = money.of('UAH', '1');
    expect(codeOf(() => +a)).toBe('VALIDATION_FAILED');
    expect(String(a)).toBe('1.00 UAH');
  });

  it('нормализует отрицательный ноль', () => {
    expect(money.of('UAH', '-0').toString()).toBe('0.00');
    expect(money.zero('UAH').negate().isNegative()).toBe(false);
  });

  it('сериализуется как строка, без number', () => {
    expect(JSON.stringify(money.of('UAH', '4200'))).toBe('{"asset":"UAH","amount":"4200.00"}');
  });

  it('сумма пустого списка — ноль актива', () => {
    expect(money.sum('USDT', []).toString()).toBe('0.000000');
  });
});

describe('Money: перевод по курсу с явным округлением и остатком (EX-013, EX-015)', () => {
  it('учебный пример 01 §7: 100 USDT × 42.00 = 4200.00 UAH без остатка', () => {
    const { value, remainder } = money.multiply(money.of('USDT', '100'), '42.00', 'UAH', 'HALF_UP');
    expect(value.toString()).toBe('4200.00');
    expect(remainder.isZero()).toBe(true);
  });

  it('возвращает остаток округления, который проводится отдельно', () => {
    const { value, remainder } = money.multiply(money.of('USDT', '1.234567'), '41.87', 'UAH', 'DOWN');
    // 1.234567 × 41.87 = 51.69132029
    expect(value.toString()).toBe('51.69');
    expect(remainder.toString()).toBe('0.00132029');
  });

  it('деление UAH на курс даёт USDT в масштабе USDT', () => {
    const { value, remainder } = money.divide(money.of('UAH', '1000.00'), '41.80', 'USDT', 'DOWN');
    expect(value.toString()).toBe('23.923444');
    expect(value.plus(money.of('USDT', '0')).asset).toBe('USDT');
    expect(remainder.isPositive()).toBe(true);
  });

  it('курс должен быть положительной десятичной строкой', () => {
    expect(codeOf(() => rate('0'))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => rate('-41.8'))).toBe('VALIDATION_FAILED');
    // @ts-expect-error number запрещён типом
    expect(codeOf(() => rate(41.8))).toBe('VALIDATION_FAILED');
  });
});
