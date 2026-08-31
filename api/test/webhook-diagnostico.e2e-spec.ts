import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb, signAdminToken } from './helpers/test-app';

/*
 * Diagnóstico da URL pública.
 *
 * PUBLIC_URL errada não gera erro em lugar nenhum: o cliente paga e o pedido
 * fica parado em "aguardando pagamento". A única defesa é um teste explícito
 * que o operador consiga rodar.
 */
describe('Diagnóstico do webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superToken: string;
  let fetchOriginal: typeof globalThis.fetch;
  const publicUrlOriginal = process.env.PUBLIC_URL;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchOriginal = globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    process.env.PUBLIC_URL = publicUrlOriginal;
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const su = await prisma.user.create({
      data: {
        email: `super-${Date.now()}@teste.local`,
        passwordHash: 'x',
        name: 'Super',
        role: Role.SUPER_ADMIN,
      },
    });
    superToken = await signAdminToken(app, su);
  });

  const checar = () =>
    request(app.getHttpServer())
      .get('/api/billing/platform/webhook-check')
      .set('Authorization', `Bearer ${superToken}`);

  function urlResponde(ok: boolean) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/public/health')) {
        if (!ok) throw new Error('connect ECONNREFUSED');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof globalThis.fetch;
  }

  it('aponta a URL pública quando ela responde', async () => {
    process.env.PUBLIC_URL = 'https://api.minhaloja.com.br';
    urlResponde(true);

    const res = await checar().expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.tunel).toBe(false);
    expect(res.body.webhookPedidos).toContain('/api/payments/webhooks/');
    expect(res.body.webhookMensalidade).toContain('/api/billing/webhooks/');
  });

  it('acusa túnel de desenvolvimento mesmo respondendo', async () => {
    process.env.PUBLIC_URL = 'https://abc123.ngrok-free.app';
    urlResponde(true);

    const res = await checar().expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.tunel).toBe(true);
    expect(String(res.body.detalhe)).toMatch(/t[úu]nel/i);
  });

  it('acusa URL inalcançável — o caso do túnel que caiu', async () => {
    process.env.PUBLIC_URL = 'https://tunel-que-morreu.ngrok-free.app';
    urlResponde(false);

    const res = await checar().expect(200);

    expect(res.body.ok).toBe(false);
    expect(res.body.motivo).toBe('inalcancavel');
    expect(String(res.body.detalhe)).toMatch(/aguardando pagamento/i);
  });

  it('acusa localhost sem nem tentar alcançar', async () => {
    process.env.PUBLIC_URL = 'http://localhost:3000';
    let tentou = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/public/health')) tentou = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof globalThis.fetch;

    const res = await checar().expect(200);

    expect(res.body.motivo).toBe('local');
    expect(tentou).toBe(false);
  });

  it('acusa PUBLIC_URL ausente', async () => {
    process.env.PUBLIC_URL = '';

    const res = await checar().expect(200);

    expect(res.body.motivo).toBe('ausente');
    expect(res.body.webhookPedidos).toBeNull();
  });

  it('só o Super Admin consulta', async () => {
    process.env.PUBLIC_URL = 'https://api.minhaloja.com.br';
    await request(app.getHttpServer())
      .get('/api/billing/platform/webhook-check')
      .expect(401);
  });
});
