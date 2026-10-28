import { createLogger } from '@raffle-exchange/core';
import { createApp } from './create-app';

async function bootstrap(): Promise<void> {
  const logger = createLogger({ name: 'exchange-api', level: process.env.LOG_LEVEL ?? 'info' });
  const port = Number.parseInt(process.env.EXCHANGE_API_PORT ?? '3100', 10);
  // По умолчанию только loopback. В контейнере слушаем 0.0.0.0, а наружу порт публикуется
  // на 127.0.0.1 хоста; доступ извне — только через обратный прокси с аутентификацией (ADR-0004).
  const host = process.env.EXCHANGE_API_HOST ?? '127.0.0.1';
  const app = await createApp(logger);
  await app.listen(port, host);
  logger.info({ port, host }, 'exchange-api started');
}

bootstrap().catch((error: unknown) => {
  createLogger({ name: 'exchange-api' }).fatal({ err: error }, 'bootstrap failed');
  process.exit(1);
});
