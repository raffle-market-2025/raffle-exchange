/**
 * Редактирование чувствительных данных перед логированием (T0.3, 02 §14, U-05).
 *
 * Запрещено логировать: ключи, cookies и состояние браузерной сессии, OTP, пароли,
 * полный PAN, IBAN, документы клиента и содержимое приватных сообщений.
 *
 * Два уровня защиты:
 * 1. по имени поля — значение заменяется целиком;
 * 2. по содержимому строк — номера карт (с проверкой Луна), украинские IBAN, Bearer-токены.
 * Второй уровень — страховка, а не основание логировать сырые payload.
 */
export const REDACTED = '[REDACTED]';

const SENSITIVE_EXACT = new Set([
  'password',
  'passwd',
  'otp',
  'otpcode',
  'code2fa',
  'cookie',
  'cookies',
  'setcookie',
  'authorization',
  'proxyauthorization',
  'apikey',
  'xapikey',
  'pan',
  'cardnumber',
  'iban',
  'cvv',
  'cvc',
  'pin',
  'privatekey',
  'seed',
  'mnemonic',
  'storagestate',
  'localstorage',
  'sessionstorage',
  'kep',
  'signature',
  'rawmessage',
  'rawpayload',
  'messagetext',
]);

const SENSITIVE_SUFFIXES = ['token', 'secret', 'password', 'cookie', 'apikey'];

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_EXACT.has(normalized)) return true;
  return SENSITIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// 13–19 цифр, допускаются одиночные пробелы или дефисы между группами.
const CARD_CANDIDATE = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;
const UA_IBAN = /\bUA\d{2}[ ]?(?:\d[ ]?){25}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g;

export function scrubString(input: string): string {
  return input
    .replace(UA_IBAN, '[IBAN]')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(CARD_CANDIDATE, (match) => {
      const digits = match.replace(/[ -]/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '[PAN]' : match;
    });
}

const MAX_DEPTH = 8;

export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      ...('code' in value ? { code: (value as { code: unknown }).code } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }
  // Объекты с собственным toJSON (Money и т.п.) сначала сериализуются.
  const source =
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  if (source === null || typeof source !== 'object') return redact(source, depth + 1, seen);

  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(source as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1, seen);
  }
  return result;
}
