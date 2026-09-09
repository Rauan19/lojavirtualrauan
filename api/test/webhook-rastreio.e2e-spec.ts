import { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
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
 * Webhook de rastreio do Melhor Envio.
 *
 * É o que faz o pedido andar sozinho no painel: postou, virou SHIPPED;
 * entregou, virou DELIVERED. Sem isso alguém precisa digitar rastreio na mão
 * em cada pedido. A rota é pública por natureza — quem chega nela é o servidor
 * do Melhor Envio — então o segredo é a única barreira, e é o primeiro teste
 * aqui.
 */
describe('Webhook de rastreio Melhor Envio (e2e)', () => {
  const ROTA = '/api/shipping/webhooks/melhor-envio';
  const SEGREDO = 'segredo-me-teste';

  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let seed: SeededStore;

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
    seed = await seedStore(prisma, { stock: 5, price: 100 });
  });

  /** Pedido pago com etiqueta já emitida — o estado em que o webhook chega. */
  const pedidoComEtiqueta = async (shipmentId = 'me-shipment-1') => {
    const token = await signCustomerToken(app, seed.customer);
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingMethod: 'Entrega padrão',
        shippingOptionId: 'padrao',
        acceptTerms: true,
      })
      .expect(201);

    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-rastreio');
    await prisma.order.update({
      where: { id: res.body.id },
      data: { carrierShipmentId: shipmentId },
    });
    return res.body.id as string;
  };

  const enviar = (body: unknown, segredo: string | null = SEGREDO) => {
    const req = request(app.getHttpServer()).post(
      segredo === null ? ROTA : `${ROTA}?secret=${segredo}`,
    );
    return req.send(body as object);
  };

  describe('autenticação', () => {
    it('sem segredo não processa nada', async () => {
      await enviar({ event: 'order.posted' }, null).expect(401);
    });

    it('segredo errado não processa nada', async () => {
      await enviar({ event: 'order.posted' }, 'chute').expect(401);
    });

    it('aceita o segredo por cabeçalho também', async () => {
      await request(app.getHttpServer())
        .post(ROTA)
        .set('x-webhook-secret', SEGREDO)
        .send({ event: 'order.posted' })
        .expect(201);
    });
  });

  describe('postagem', () => {
    it('marca o pedido como enviado e grava o rastreio', async () => {
      const orderId = await pedidoComEtiqueta();

      const res = await enviar({
        event: 'order.posted',
        data: {
          id: 'me-shipment-1',
          tracking: 'BR123456789BR',
          tracking_url: 'https://rastreio.exemplo/BR123456789BR',
        },
      }).expect(201);

      expect(res.body).toMatchObject({ matched: 1, status: 'SHIPPED' });

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe(OrderStatus.SHIPPED);
      expect(order.trackingCode).toBe('BR123456789BR');
      expect(order.shippedAt).toBeTruthy();
    });

    it('acha o pedido pelo código de rastreio quando não vem o id', async () => {
      const orderId = await pedidoComEtiqueta();
      await prisma.order.update({
        where: { id: orderId },
        data: { trackingCode: 'BR999999999BR' },
      });

      const res = await enviar({
        event: 'order.posted',
        data: { tracking: 'BR999999999BR' },
      }).expect(201);

      expect(res.body).toMatchObject({ matched: 1, orderId });
    });
  });

  describe('entrega', () => {
    it('marca como entregue', async () => {
      const orderId = await pedidoComEtiqueta();

      const res = await enviar({
        event: 'order.delivered',
        data: { id: 'me-shipment-1', tracking: 'BR123456789BR' },
      }).expect(201);

      expect(res.body).toMatchObject({ matched: 1, status: 'DELIVERED' });

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe(OrderStatus.DELIVERED);
      expect(order.deliveredAt).toBeTruthy();
    });

    it('entregue não volta para enviado se a postagem chegar atrasada', async () => {
      const orderId = await pedidoComEtiqueta();

      await enviar({
        event: 'order.delivered',
        data: { id: 'me-shipment-1' },
      }).expect(201);

      // O Melhor Envio reenvia eventos; a ordem de chegada não é garantida.
      await enviar({
        event: 'order.posted',
        data: { id: 'me-shipment-1' },
      }).expect(201);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe(OrderStatus.DELIVERED);
    });

    it('a mesma entrega duas vezes não muda nada', async () => {
      const orderId = await pedidoComEtiqueta();
      const corpo = {
        event: 'order.delivered',
        data: { id: 'me-shipment-1', tracking: 'BR123456789BR' },
      };

      await enviar(corpo).expect(201);
      const primeira = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      await enviar(corpo).expect(201);
      const segunda = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      expect(segunda.deliveredAt).toEqual(primeira.deliveredAt);
      expect(segunda.status).toBe(OrderStatus.DELIVERED);
    });
  });

  describe('ruído', () => {
    it('evento sem id nem rastreio é ignorado sem erro', async () => {
      const res = await enviar({ event: 'order.posted', data: {} }).expect(201);
      expect(res.body).toMatchObject({ matched: 0 });
    });

    it('etiqueta que não é de nenhum pedido não quebra', async () => {
      const res = await enviar({
        event: 'order.delivered',
        data: { id: 'etiqueta-de-outro-sistema' },
      }).expect(201);
      expect(res.body).toMatchObject({ matched: 0 });
    });

    it('evento desconhecido só atualiza o vínculo, sem mexer no status', async () => {
      const orderId = await pedidoComEtiqueta();

      const res = await enviar({
        event: 'order.whatever',
        data: { id: 'me-shipment-1', tracking: 'BR555555555BR' },
      }).expect(201);

      expect(res.body).toMatchObject({ matched: 1 });

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.trackingCode).toBe('BR555555555BR');
      expect(order.status).not.toBe(OrderStatus.SHIPPED);
    });
  });
});
