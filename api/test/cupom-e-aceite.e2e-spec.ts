import { INestApplication } from '@nestjs/common';
import { DiscountType, OrderStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ADDRESS,
  createTestApp,
  resetDb,
  seedStore,
  signCustomerToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * Cupom e aceite das condições de venda.
 *
 * O cupom era validado na criação do pedido e só contabilizado na aprovação
 * do pagamento. No meio dessa janela o contador ficava parado, então um
 * cupom de N usos era fechado por muito mais gente — e o desconto extra saía
 * do bolso do lojista.
 */
describe('Cupom e aceite (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let seed: SeededStore;
  let token: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    orders = app.get(OrdersService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedStore(prisma, { stock: 100 });
    token = await signCustomerToken(app, seed.customer);
  });

  async function criarCupom(over: Partial<Prisma.CouponUncheckedCreateInput>) {
    return prisma.coupon.create({
      data: {
        storeId: seed.store.id,
        code: 'DESCONTO10',
        type: DiscountType.PERCENT,
        value: new Prisma.Decimal(10),
        active: true,
        ...over,
      },
    });
  }

  function checkout(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Store-Slug', seed.store.slug)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingMethod: 'Entrega padrão',
        acceptTerms: true,
        ...body,
      });
  }

  describe('limite de usos', () => {
    it('não passa do maxUses nem com pedidos simultâneos', async () => {
      await criarCupom({ maxUses: 3 });

      const respostas = await Promise.all(
        Array.from({ length: 10 }, () =>
          checkout({ couponCode: 'DESCONTO10' }),
        ),
      );

      const criados = respostas.filter((r) => r.status === 201);
      expect(criados).toHaveLength(3);

      const cupom = await prisma.coupon.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(cupom.usedCount).toBe(3);

      // os demais tomam recusa explícita, não passam com desconto
      const recusados = respostas.filter((r) => r.status !== 201);
      expect(recusados).toHaveLength(7);
      for (const r of recusados) {
        expect(String(r.body.message)).toMatch(/esgotado/i);
      }
    });

    it('reserva já na criação, sem esperar o pagamento', async () => {
      await criarCupom({ maxUses: 5 });
      await checkout({ couponCode: 'DESCONTO10' }).expect(201);

      const cupom = await prisma.coupon.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(cupom.usedCount).toBe(1);
    });

    it('devolve o uso quando o pedido é cancelado', async () => {
      await criarCupom({ maxUses: 1 });
      const res = await checkout({ couponCode: 'DESCONTO10' }).expect(201);

      await orders.updateStatus(seed.store.id, res.body.id, {
        status: OrderStatus.CANCELLED,
      });

      const cupom = await prisma.coupon.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(cupom.usedCount).toBe(0);

      // e o cupom volta a funcionar para o próximo cliente
      await checkout({ couponCode: 'DESCONTO10' }).expect(201);
    });

    it('devolve o uso quando o pedido expira sem pagamento', async () => {
      await criarCupom({ maxUses: 1 });
      const res = await checkout({ couponCode: 'DESCONTO10' }).expect(201);

      await prisma.order.update({
        where: { id: res.body.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      await orders.expireAbandonedUnpaidOrders();

      const cupom = await prisma.coupon.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(cupom.usedCount).toBe(0);
    });

    it('não devolve duas vezes o mesmo uso', async () => {
      await criarCupom({ maxUses: 5 });
      const res = await checkout({ couponCode: 'DESCONTO10' }).expect(201);

      await orders.releaseOrderCoupon(seed.store.id, res.body.id);
      await orders.releaseOrderCoupon(seed.store.id, res.body.id);

      const cupom = await prisma.coupon.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(cupom.usedCount).toBe(0);
    });

    it('cupom sem maxUses não trava', async () => {
      await criarCupom({ maxUses: null });

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => checkout({ couponCode: 'DESCONTO10' })),
      );
      expect(respostas.every((r) => r.status === 201)).toBe(true);
    });
  });

  describe('limite por cliente', () => {
    it('barra o mesmo cliente depois do limite', async () => {
      await criarCupom({ maxPerCustomer: 2 });

      await checkout({ couponCode: 'DESCONTO10' }).expect(201);
      await checkout({ couponCode: 'DESCONTO10' }).expect(201);
      const terceiro = await checkout({ couponCode: 'DESCONTO10' });

      expect(terceiro.status).toBe(400);
      expect(String(terceiro.body.message)).toMatch(/máximo de vezes/i);
    });

    it('pedido cancelado não queima o direito do cliente', async () => {
      await criarCupom({ maxPerCustomer: 1 });
      const res = await checkout({ couponCode: 'DESCONTO10' }).expect(201);

      await orders.updateStatus(seed.store.id, res.body.id, {
        status: OrderStatus.CANCELLED,
      });

      await checkout({ couponCode: 'DESCONTO10' }).expect(201);
    });
  });

  describe('aceite das condições de venda', () => {
    it('recusa o pedido sem aceite', async () => {
      const res = await checkout({ acceptTerms: false });

      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/condições de venda/i);
    });

    it('recusa quando o campo nem vem', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Store-Slug', seed.store.slug)
        .send({
          items: [{ productId: seed.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingMethod: 'Entrega padrão',
        });

      expect(res.status).toBe(400);
    });

    it('grava o momento do aceite como prova', async () => {
      const res = await checkout().expect(201);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(order.termsAcceptedAt).toBeInstanceOf(Date);
    });

    it('pedido recusado por falta de aceite não reserva estoque', async () => {
      const antes = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });

      await checkout({ acceptTerms: false }).expect(400);

      const depois = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(depois.stock).toBe(antes.stock);
    });
  });
});
