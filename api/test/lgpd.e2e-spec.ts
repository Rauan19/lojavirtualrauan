import { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ADDRESS,
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  signCustomerToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * Direitos do titular (LGPD art. 18).
 *
 * A exclusão é feita por anonimização, não por apagamento: o art. 16, I
 * autoriza — e a legislação fiscal obriga — manter o registro das operações.
 * Apagar o pedido destruiria a contabilidade da loja e a nota já emitida.
 */
describe('LGPD — dados pessoais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let customerToken: string;
  let adminToken: string;

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
    seed = await seedStore(prisma, { stock: 10 });
    customerToken = await signCustomerToken(app, seed.customer);
    adminToken = await signAdminToken(app, seed.admin);
  });

  /** Cliente com pedido, endereço salvo e telefone — o cenário real. */
  async function comHistorico() {
    await prisma.customer.update({
      where: { id: seed.customer.id },
      data: { phone: '75999998888', cpf: '39053344705' },
    });
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingOptionId: 'padrao',
        acceptTerms: true,
        saveAddress: true,
      })
      .expect(201);
    return res.body.id as string;
  }

  describe('acesso e portabilidade', () => {
    it('cliente baixa os próprios dados', async () => {
      await comHistorico();

      const res = await request(app.getHttpServer())
        .get('/api/storefront/account/dados-pessoais')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.titular.email).toBe(seed.customer.email);
      expect(res.body.titular.telefone).toBe('75999998888');
      expect(res.body.pedidos).toHaveLength(1);
      expect(res.body.pedidos[0].itens[0].produto).toBe('Camiseta Teste');
      expect(res.body.enderecos.length).toBeGreaterThan(0);
      // avisa que nota fiscal fica retida por obrigação legal
      expect(res.body.observacao).toContain('art. 16');
    });

    it('lojista consegue atender um pedido de acesso', async () => {
      await comHistorico();

      const res = await request(app.getHttpServer())
        .get(`/api/admin/customers/${seed.customer.id}/dados-pessoais`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.titular.email).toBe(seed.customer.email);
    });

    it('exportação não atravessa lojas', async () => {
      const outra = await seedStore(prisma, { slug: 'loja-vizinha' });
      const tokenVizinho = await signAdminToken(app, outra.admin);

      await request(app.getHttpServer())
        .get(`/api/admin/customers/${seed.customer.id}/dados-pessoais`)
        .set('x-store-slug', outra.store.slug)
        .set('Authorization', `Bearer ${tokenVizinho}`)
        .expect(404);
    });
  });

  describe('exclusão por anonimização', () => {
    it('remove o que identifica e mantém o histórico financeiro', async () => {
      const orderId = await comHistorico();

      await request(app.getHttpServer())
        .post(`/api/admin/customers/${seed.customer.id}/anonimizar`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const cliente = await prisma.customer.findUniqueOrThrow({
        where: { id: seed.customer.id },
      });
      expect(cliente.name).toBe('[dados removidos]');
      expect(cliente.email).toMatch(/@removido\.local$/);
      expect(cliente.phone).toBeNull();
      expect(cliente.cpf).toBeNull();
      expect(cliente.passwordHash).toBeNull();

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      expect(pedido.customerName).toBe('[dados removidos]');
      expect(pedido.customerPhone).toBeNull();
      expect(pedido.customerDocument).toBeNull();
      expect(pedido.shippingAddress).toEqual({});
      // o que a contabilidade precisa continua de pé
      expect(Number(pedido.total)).toBeGreaterThan(0);
      expect(pedido.orderNumber).toBeTruthy();
      expect(pedido.items).toHaveLength(1);
      expect(pedido.items[0].productName).toBe('Camiseta Teste');
    });

    it('apaga os endereços salvos', async () => {
      await comHistorico();
      expect(
        await prisma.address.count({ where: { customerId: seed.customer.id } }),
      ).toBeGreaterThan(0);

      await request(app.getHttpServer())
        .post(`/api/admin/customers/${seed.customer.id}/anonimizar`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(
        await prisma.address.count({ where: { customerId: seed.customer.id } }),
      ).toBe(0);
    });

    it('derruba as sessões abertas', async () => {
      await comHistorico();

      // token válido antes
      await request(app.getHttpServer())
        .get('/api/storefront/auth/me')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/admin/customers/${seed.customer.id}/anonimizar`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // o mesmo token não vale mais
      await request(app.getHttpServer())
        .get('/api/storefront/auth/me')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(401);
    });

    it('não deixa anonimizar duas vezes', async () => {
      const anonimizar = () =>
        request(app.getHttpServer())
          .post(`/api/admin/customers/${seed.customer.id}/anonimizar`)
          .set('x-store-slug', seed.store.slug)
          .set('Authorization', `Bearer ${adminToken}`);

      await anonimizar().expect(201);
      const segunda = await anonimizar();
      expect(segunda.status).toBe(400);
      expect(String(segunda.body.message)).toMatch(/já foram removidos/i);
    });

    it('não atravessa lojas', async () => {
      const outra = await seedStore(prisma, { slug: 'loja-vizinha-2' });
      const tokenVizinho = await signAdminToken(app, outra.admin);

      await request(app.getHttpServer())
        .post(`/api/admin/customers/${seed.customer.id}/anonimizar`)
        .set('x-store-slug', outra.store.slug)
        .set('Authorization', `Bearer ${tokenVizinho}`)
        .expect(404);

      const cliente = await prisma.customer.findUniqueOrThrow({
        where: { id: seed.customer.id },
      });
      expect(cliente.name).not.toBe('[dados removidos]');
    });
  });

  describe('exclusão pelo próprio cliente', () => {
    const excluir = (password: string) =>
      request(app.getHttpServer())
        .post('/api/storefront/account/excluir')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ password });

    it('exige a senha certa', async () => {
      const res = await excluir('senha-errada');
      expect(res.status).toBe(401);

      const cliente = await prisma.customer.findUniqueOrThrow({
        where: { id: seed.customer.id },
      });
      expect(cliente.name).not.toBe('[dados removidos]');
    });

    it('com a senha certa, anonimiza', async () => {
      await excluir(seed.customer.password).expect(201);

      const cliente = await prisma.customer.findUniqueOrThrow({
        where: { id: seed.customer.id },
      });
      expect(cliente.name).toBe('[dados removidos]');
    });
  });
});
