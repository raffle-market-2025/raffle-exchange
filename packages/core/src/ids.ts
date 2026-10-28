/**
 * Идентификаторы (T0.3, 02 §10).
 *
 * Публичные ID непоследовательные: UUID v4 из криптографического генератора.
 * Не UUID v7 — он раскрывает время создания. Непоследовательность не заменяет авторизацию.
 * Брендированные типы не дают перепутать orderId и commandId на уровне компиляции.
 */
import { randomUUID } from 'node:crypto';

declare const brand: unique symbol;
export type Id<Kind extends string> = string & { readonly [brand]: Kind };

export type OrderId = Id<'Order'>;
export type CommandId = Id<'Command'>;
export type BusinessEventId = Id<'BusinessEvent'>;
export type CorrelationId = Id<'Correlation'>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newId<Kind extends string>(): Id<Kind> {
  return randomUUID() as Id<Kind>;
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function parseId<Kind extends string>(value: unknown): Id<Kind> | null {
  return isUuidV4(value) ? (value as Id<Kind>) : null;
}
