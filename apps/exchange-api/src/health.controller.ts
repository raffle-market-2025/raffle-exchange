import { Controller, Get } from '@nestjs/common';

/**
 * Только живость процесса. Это не «можно торговать» (EX-035, 07 §8):
 * готовность исполнения показывает отдельный статус подключений, который появится в треке 6.
 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { live: true } {
    return { live: true };
  }
}
