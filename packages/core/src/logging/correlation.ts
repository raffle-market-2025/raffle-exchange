/**
 * Сквозной correlationId (02 §11, 02 §14).
 * Хранится в AsyncLocalStorage и автоматически попадает в каждую запись лога.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { newId, type CorrelationId } from '../ids';

interface CorrelationContext {
  readonly correlationId: CorrelationId;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

// Принимаем внешний ID только в безопасном формате, чтобы не тащить в логи произвольный ввод.
const ACCEPTABLE = /^[A-Za-z0-9-]{8,64}$/;

export function normalizeCorrelationId(candidate: unknown): CorrelationId {
  return typeof candidate === 'string' && ACCEPTABLE.test(candidate)
    ? (candidate as CorrelationId)
    : newId<'Correlation'>();
}

export function withCorrelation<T>(correlationId: CorrelationId, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function currentCorrelationId(): CorrelationId | undefined {
  return storage.getStore()?.correlationId;
}
