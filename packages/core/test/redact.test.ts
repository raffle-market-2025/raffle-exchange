import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  MoneyFactory,
  REDACTED,
  createLogger,
  isSensitiveKey,
  normalizeCorrelationId,
  redact,
  scrubString,
  withCorrelation,
} from '../src';

// Тестовые значения: номер из официального набора тестовых карт, вымышленный IBAN.
const TEST_PAN = '4111 1111 1111 1111';
const TEST_IBAN = 'UA213223130000026007233566001';

describe('[U-05] редактирование логов: секреты и реквизиты не попадают в вывод', () => {
  it('скрывает поля по имени, включая вложенные и составные имена', () => {
    const input = {
      apiKey: 'k-123',
      'x-api-key': 'k-456',
      headers: { Authorization: 'Bearer abc', cookie: 'sid=1' },
      walt: { sessionCookie: 'c', refreshToken: 'r', storageState: { cookies: [] } },
      bank: { otp: '123456', cardNumber: TEST_PAN, password: 'p' },
      sessionId: 'browser-session-7',
    };
    const out = redact(input) as Record<string, any>;
    expect(out.apiKey).toBe(REDACTED);
    expect(out['x-api-key']).toBe(REDACTED);
    expect(out.headers.Authorization).toBe(REDACTED);
    expect(out.headers.cookie).toBe(REDACTED);
    expect(out.walt.sessionCookie).toBe(REDACTED);
    expect(out.walt.refreshToken).toBe(REDACTED);
    expect(out.walt.storageState).toBe(REDACTED);
    expect(out.bank).toEqual({ otp: REDACTED, cardNumber: REDACTED, password: REDACTED });
    // Идентификатор сессии нужен эксплуатации и секретом не является.
    expect(out.sessionId).toBe('browser-session-7');
  });

  it('вычищает номера карт (по Луну), IBAN и Bearer из свободного текста', () => {
    const text = `платёж с ${TEST_PAN} на ${TEST_IBAN}, header Bearer eyJhbGciOi.abc.def`;
    const out = scrubString(text);
    expect(out).not.toContain('4111');
    expect(out).not.toContain('UA21');
    expect(out).not.toContain('eyJ');
    expect(out).toContain('[PAN]');
    expect(out).toContain('[IBAN]');
  });

  it('не трогает числа, не проходящие проверку Луна (суммы, ID сделок)', () => {
    expect(scrubString('order 1234567890123 amount 4200.00')).toBe('order 1234567890123 amount 4200.00');
  });

  it('обрабатывает циклы, ошибки и Money', () => {
    const money = new MoneyFactory({ UAH: 2, USDT: 6 });
    const node: Record<string, unknown> = { amount: money.of('UAH', '4200') };
    node.self = node;
    const out = redact({ node, err: new Error(`fail ${TEST_PAN}`) }) as Record<string, any>;
    expect(out.node.amount).toEqual({ asset: 'UAH', amount: '4200.00' });
    expect(out.node.self).toBe('[CIRCULAR]');
    expect(out.err.message).toBe('fail [PAN]');
  });

  it('классификация имён полей', () => {
    for (const key of ['API_KEY', 'accessToken', 'webhook_secret', 'Set-Cookie', 'iban', 'cvv']) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    for (const key of ['orderId', 'sessionId', 'amount', 'deviceId', 'tokenizedAt']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });

  it('итоговая строка лога не содержит секретов и несёт correlationId', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString('utf8'));
        cb();
      },
    });
    const logger = createLogger({ name: 'test', destination: sink });
    const correlationId = normalizeCorrelationId('corr-abcdef12');

    withCorrelation(correlationId, () => {
      logger.info(
        { apiKey: 'live-key-should-not-leak', card: TEST_PAN, nested: { otp: '654321' } },
        `оплата с карты ${TEST_PAN}`,
      );
    });

    expect(lines).toHaveLength(1);
    const raw = lines[0]!;
    for (const secret of ['live-key-should-not-leak', '4111', '654321']) {
      expect(raw).not.toContain(secret);
    }
    const parsed = JSON.parse(raw);
    expect(parsed.correlationId).toBe('corr-abcdef12');
    expect(parsed.msg).toBe('оплата с карты [PAN]');
  });

  it('недопустимый внешний correlationId заменяется новым', () => {
    expect(normalizeCorrelationId('<script>')).not.toBe('<script>');
    expect(normalizeCorrelationId(`${'a'.repeat(200)}`)).toHaveLength(36);
  });
});
