import { INestApplication } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  type SeededStore,
} from './helpers/test-app';

/**
 * Plano grátis (Começo): o lojista escolhe sem pagar nada, e o plano não
 * permite domínio próprio — nem salvar um novo, nem servir a loja por ele.
 */
describe('Plano grátis e domínio próprio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let loja: SeededStore;
  let token: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    loja = await seedStore(prisma, { slug: 'loja-gratis' });
    await prisma.store.update({
      where: { id: loja.store.id },
      data: {
        status: StoreStatus.ACTIVE,
        planName: 'plan-seed-mensal',
        planDueAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        customDomain: 'www.minhaloja-teste.com.br',
      },
    });
    token = await signAdminToken(app, loja.admin);
  });

  const api = (m: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())
      [m](url)
      .set('x-store-slug', loja.store.slug)
      .set('Authorization', `Bearer ${token}`);

  it('"Usar o plano grátis" troca na hora, sem cobrança', async () => {
    const res = await api('post', '/api/billing/free').expect(201);
    expect(res.body.limits.feeBps).toBe(200);
    const s = await prisma.store.findUniqueOrThrow({
      where: { id: loja.store.id },
    });
    expect(s.planName).toBe('plan-seed-comeco');
    expect(s.status).toBe(StoreStatus.ACTIVE);
    expect(s.planDueAt).toBeNull();
    expect(Number(s.monthlyFee)).toBe(0);
    expect(await prisma.platformInvoice.count()).toBe(0);
  });

  it('não gera cobrança para o plano grátis', async () => {
    await api('post', '/api/billing/subscribe/pix')
      .send({ planId: 'plan-seed-comeco' })
      .expect(400);
  });

  it('no grátis, o domínio próprio para de abrir a loja', async () => {
    await request(app.getHttpServer())
      .get('/api/public/resolve-host?host=www.minhaloja-teste.com.br')
      .expect(200);
    await api('post', '/api/billing/free').expect(201);
    await request(app.getHttpServer())
      .get('/api/public/resolve-host?host=www.minhaloja-teste.com.br')
      .expect(404);
  });

  it('no grátis, não deixa salvar domínio novo; mas deixa tirar', async () => {
    await api('post', '/api/billing/free').expect(201);
    const r = await api('patch', '/api/stores/me/branding')
      .send({ customDomain: 'www.outra-loja.com.br' })
      .expect(403);
    expect(r.body.message).toContain('Domínio próprio não faz parte');
    await api('patch', '/api/stores/me/branding')
      .send({ customDomain: '' })
      .expect(200);
  });

  it('registra quem mudou a taxa de um plano', async () => {
    const superAdmin = await prisma.user.create({
      data: {
        email: 'super@teste.com',
        passwordHash: 'x',
        name: 'Super',
        role: 'SUPER_ADMIN',
      },
    });
    const superToken = await signAdminToken(app, superAdmin);
    await request(app.getHttpServer())
      .patch('/api/billing/platform/plans/plan-seed-mensal')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ feeBps: 80 })
      .expect(200);
    const log = await prisma.platformPlanChange.findFirstOrThrow({
      where: { planId: 'plan-seed-mensal' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.changedById).toBe(superAdmin.id);
    expect(log.changes).toEqual({ feeBps: { de: 50, para: 80 } });
    await prisma.platformPlan.update({
      where: { id: 'plan-seed-mensal' },
      data: { feeBps: 50 },
    });
  });
});
