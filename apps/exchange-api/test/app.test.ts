import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '@raffle-exchange/core';
import { createApp } from '../src/create-app';

describe('exchange-api: каркас', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const sink = new Writable({ write: (_c, _e, cb) => cb() });
    app = await createApp(createLogger({ name: 'test', destination: sink }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('живость процесса не выдаёт себя за готовность торговли', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ live: true });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('выдаёт correlationId и принимает корректный внешний', async () => {
    const generated = await request(app.getHttpServer()).get('/health/live');
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'admin-req-0001');
    expect(echoed.headers['x-correlation-id']).toBe('admin-req-0001');
  });

  it('ошибка отдаётся в публичном формате без stack (02 §11)', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-such-route')
      .set('x-correlation-id', 'admin-req-0002')
      .expect(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'NOT_FOUND',
      correlationId: 'admin-req-0002',
      retryable: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});
