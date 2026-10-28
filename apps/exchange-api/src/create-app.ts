import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Logger } from '@raffle-exchange/core';
import { AppModule } from './app.module';
import { PublicErrorFilter } from './public-error.filter';

export async function createApp(logger: Logger): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.useGlobalFilters(new PublicErrorFilter(logger));
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  return app;
}
