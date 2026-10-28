import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { CorrelationMiddleware } from './correlation.middleware';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*path');
  }
}
