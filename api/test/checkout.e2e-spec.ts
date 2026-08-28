import { INestApplication } from '@nestjs/common';
import { DiscountType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ADDRESS,
  SeededStore,
  createTestApp,
  resetDb,
  seedStore,
  signCustomerToken,
} from './helpers/test-app';

/**
 * Fluxo de compra: os caminhos onde um bug custa dinheiro de verdade.
 */
describe('Checkout (e2e)', () => {
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
    seed = await seedStore(prisma, { stock: 5, price: 100, freteValorFixo: 25 });

    token = await signCustomerToken(app, seed.customer);
  });

  const checkout = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingMethod: 'Entrega padrão',
        shippingOptionId: 'padrao',
        ...body,
      });

  describe('exige login', () => {
    it('recusa fechar pedido sem token', async () => {
      await request(app.getHttpServer())
        .post('/api/checkout/orders')
        .set('x-store-slug', seed.store.slug)
        .send({
          items: [{ productId: seed.product.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          shippingMethod: 'Entrega padrão',
          shippingOptionId: 'padrao',
        })
        .expect(401);
    });
  });

  describe('frete', () => {
    it('usa o preço da cotação do servidor, não o que o cliente manda', async () => {
      const res = await checkout({ shippingCost: 0 }).expect(201);

      // tabela da loja: entrega padrão = 25
      expect(Number(res.body.shippingCost)).toBe(25);
      expect(Number(res.body.total)).toBe(125);
    });

    it('ignora frete negativo', async () => {
      // @Min(0) barra no DTO
      await checkout({ shippingCost: -500 }).expect(400);
    });

    it('recusa opção de entrega que não existe na cotação', async () => {
      const res = await checkout({
        shippingMethod: 'Frete de graça pra mim',
        shippingOptionId: 'inventado',
      }).expect(400);

      expect(String(res.body.message)).toMatch(/entrega/i);
    });

    it('cobra a opção expressa quando é ela que o cliente escolhe', async () => {
      const res = await checkout({
        shippingMethod: 'Entrega expressa',
        shippingOptionId: 'expressa',
      }).expect(201);

      expect(Number(res.body.shippingCost)).toBe(40); // 25 * 1.6
    });
  });

  describe('preço e itens', () => {
    it('usa o preço do banco (cliente não influencia o total)', async () => {
      const res = await checkout({}).expect(201);
      expect(Number(res.body.subtotal)).toBe(100);
    });

    it('recusa produto de outra loja', async () => {
      const outra = await seedStore(prisma, { slug: 'loja-vizinha' });
      await checkout({
        items: [{ productId: outra.product.id, quantity: 1 }],
      }).expect(400);
    });

    it('recusa quantidade acima do estoque', async () => {
      await checkout({
        items: [{ productId: seed.product.id, quantity: 99 }],
      }).expect(400);
    });
  });

  describe('reserva de estoque', () => {
    it('baixa o estoque assim que o pedido é criado', async () => {
      await checkout({ items: [{ productId: seed.product.id, quantity: 2 }] })
        .expect(201);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(3);
    });

    it('não deixa dois pedidos simultâneos levarem o mesmo último item', async () => {
      await prisma.product.update({
        where: { id: seed.product.id },
        data: { stock: 1 },
      });

      const [a, b] = await Promise.all([
        checkout({ items: [{ productId: seed.product.id, quantity: 1 }] }),
        checkout({ items: [{ productId: seed.product.id, quantity: 1 }] }),
      ]);

      const status = [a.status, b.status].sort();
      expect(status).toEqual([201, 400]);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(0);
    });

    it('devolve o estoque quando o pedido expira sem pagar', async () => {
      const res = await checkout({}).expect(201);

      await prisma.order.update({
        where: { id: res.body.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });

      await orders.expireAbandonedUnpaidOrders();

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(5);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.stockReserved).toBe(false);
    });

    it('não devolve o estoque duas vezes', async () => {
      const res = await checkout({}).expect(201);

      await orders.restockOrderItems(seed.store.id, res.body.id);
      await orders.restockOrderItems(seed.store.id, res.body.id);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(5); // e não 6
    });
  });

  describe('confirmação de pagamento', () => {
    it('marca como pago sem mexer no estoque (já reservado)', async () => {
      const res = await checkout({}).expect(201);

      await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-1');

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.paymentStatus).toBe(PaymentStatus.APPROVED);
      expect(order.mpPaymentId).toBe('mp-1');

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(4);
    });

    it('webhook duplicado não conta o cupom duas vezes', async () => {
      const coupon = await prisma.coupon.create({
        data: {
          storeId: seed.store.id,
          code: 'DEZOFF',
          type: DiscountType.PERCENT,
          value: new Prisma.Decimal(10),
          active: true,
          usedCount: 0,
        },
      });

      const res = await checkout({ couponCode: coupon.code }).expect(201);

      // MP reenvia notificação: chega duas vezes, às vezes em paralelo
      await Promise.all([
        orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-2'),
        orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-2'),
      ]);
      await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-2');

      const after = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(after.usedCount).toBe(1);
    });

    it('webhook duplicado não baixa o estoque duas vezes', async () => {
      const res = await checkout({
        items: [{ productId: seed.product.id, quantity: 2 }],
      }).expect(201);

      await Promise.all([
        orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-3'),
        orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-3'),
      ]);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(3);
    });

    it('estorno devolve o estoque uma única vez', async () => {
      const res = await checkout({}).expect(201);
      await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-4');

      await orders.restockOrderItems(seed.store.id, res.body.id);
      await orders.restockOrderItems(seed.store.id, res.body.id);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(5);
    });

    it('pagamento aprovado após expirar revive o pedido se ainda houver estoque', async () => {
      const res = await checkout({}).expect(201);

      await prisma.order.update({
        where: { id: res.body.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      await orders.expireAbandonedUnpaidOrders();

      await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-5');

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.stockReserved).toBe(true);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(4);
    });

    it('sem estoque para reviver, registra o pagamento mas não entrega o pedido', async () => {
      const res = await checkout({}).expect(201);

      await prisma.order.update({
        where: { id: res.body.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      await orders.expireAbandonedUnpaidOrders();

      // outro cliente levou tudo enquanto isso
      await prisma.product.update({
        where: { id: seed.product.id },
        data: { stock: 0 },
      });

      await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-6');

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      // pagamento fica registrado para o lojista estornar
      expect(order.paymentStatus).toBe(PaymentStatus.APPROVED);
      expect(order.status).toBe(OrderStatus.CANCELLED);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(product.stock).toBe(0);
    });
  });
});
