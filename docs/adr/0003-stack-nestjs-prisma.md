# ADR-0003. Стек: NestJS, Prisma, TypeScript strict

Статус: **принято**.

## Контекст

Остальные проекты используют NestJS, Prisma и монорепо. Денежная часть требует ограничений, которые Prisma не выражает: CHECK, частичные уникальные индексы, сбалансированность журнала по каждому активу (02 §9, 02 §10).

## Решение

1. TypeScript в строгом режиме (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 22, pnpm 10 + turbo.
2. NestJS для `exchange-api`; доменные пакеты от фреймворка не зависят.
3. Prisma — схема и миграции в `packages/db`. Чего Prisma не выражает, пишется сырым SQL в тех же миграциях: CHECK на масштаб и знак сумм, частичные unique, отложенный (`DEFERRABLE INITIALLY DEFERRED`) триггер, проверяющий баланс журнала по каждому активу при коммите.
4. CAS по `version` — `updateMany({ where: { id, version } })` с проверкой числа изменённых строк; захват строк — `$queryRaw` с `FOR UPDATE`.
5. Деньги — `Money` на decimal.js из `@raffle-exchange/core`. В доменных пакетах и worker линтер запрещает `Number()`, `parseFloat`, `Math.round`, `toFixed`, `Date.now()` и `new Date()` без аргументов.
6. Тесты — vitest; для NestJS через SWC (esbuild не выдаёт decorator metadata).
7. Цепочка поставки: точные версии, `minimumReleaseAge` 14 дней, lifecycle-скрипты только у пакетов из `onlyBuiltDependencies`.

## Последствия

- Изменения схемы после G1 — только через владельца схемы и ревью (план этапа B).
- `prisma generate` и `migrate` в изолированной песочнице без доступа к binaries.prisma.sh не работают; CI работает с сетью.
