import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('valida o corpo do login', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
  });

  it('recusa campo desconhecido no corpo (whitelist)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x', role: 'SUPER_ADMIN' })
      .expect(400);
  });

  it('exige autenticação nas rotas de admin', async () => {
    await request(app.getHttpServer()).get('/api/admin/orders').expect(401);
  });

  it('404 para loja inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/stores/public/nao-existe')
      .expect(404);
  });
});
