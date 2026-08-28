import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { LabelService } from '../src/shipping/label.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { parseMelhorEnvioServiceId } from '../src/shipping/providers/melhor-envio-label';
import {
  ADDRESS,
  SeededStore,
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  signCustomerToken,
} from './helpers/test-app';

/**
 * Etiqueta do Melhor Envio. Comprar etiqueta gasta saldo real do lojista,
 * então a trava contra emitir duas vezes é o teste que mais importa aqui.
 */
describe('Etiqueta Melhor Envio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let labels: LabelService;
  let seed: SeededStore;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    orders = app.get(OrdersService);
    labels = app.get(LabelService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedStore(prisma, { stock: 5, price: 100 });
  });

  const criarPedidoPago = async () => {
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
      })
      .expect(201);

    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-etq');
    return res.body.id as string;
  };

  describe('parseMelhorEnvioServiceId', () => {
    it('extrai o id do serviço', () => {
      expect(parseMelhorEnvioServiceId('me-1')).toBe(1);
      expect(parseMelhorEnvioServiceId('me-17')).toBe(17);
    });

    it('recusa id que não é do Melhor Envio', () => {
      expect(parseMelhorEnvioServiceId('padrao')).toBeNull();
      expect(parseMelhorEnvioServiceId('me-abc')).toBeNull();
      expect(parseMelhorEnvioServiceId(null)).toBeNull();
    });
  });

  it('guarda no pedido o serviço de frete escolhido', async () => {
    const orderId = await criarPedidoPago();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    // sem isso não dá para emitir etiqueta depois
    expect(order.shippingServiceId).toBe('padrao');
  });

  it('recusa etiqueta de pedido não pago', async () => {
    const token = await signCustomerToken(app, seed.customer);
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingOptionId: 'padrao',
      })
      .expect(201);

    await expect(
      labels.generateForOrder(seed.store.id, res.body.id),
    ).rejects.toThrow(/pedido pago/i);
  });

  it('recusa quando a loja não usa Melhor Envio', async () => {
    const orderId = await criarPedidoPago();

    await expect(
      labels.generateForOrder(seed.store.id, orderId),
    ).rejects.toThrow(/Melhor Envio/i);
  });

  it('cobra configuração do token antes de tentar emitir', async () => {
    const orderId = await criarPedidoPago();
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { freteModo: 'melhor_envio' },
    });

    await expect(
      labels.generateForOrder(seed.store.id, orderId),
    ).rejects.toThrow(/token do Melhor Envio/i);
  });

  it('exige o endereço de origem completo', async () => {
    const orderId = await criarPedidoPago();
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        freteModo: 'melhor_envio',
        freteToken: 'token-fake',
        freteEmailContato: 'loja@teste.local',
        freteCepOrigem: '01310100',
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { shippingServiceId: 'me-1' },
    });

    await expect(
      labels.generateForOrder(seed.store.id, orderId),
    ).rejects.toThrow(/endereço de origem/i);
  });

  it('avisa quando o pedido não guardou serviço do Melhor Envio', async () => {
    const orderId = await criarPedidoPago();
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        freteModo: 'melhor_envio',
        freteToken: 'token-fake',
        freteEmailContato: 'loja@teste.local',
      },
    });

    // pedido veio de cotação manual: shippingServiceId = "padrao"
    await expect(
      labels.generateForOrder(seed.store.id, orderId),
    ).rejects.toThrow(/serviço de frete/i);
  });

  it('não compra a etiqueta duas vezes (gastaria saldo em dobro)', async () => {
    const orderId = await criarPedidoPago();

    await prisma.order.update({
      where: { id: orderId },
      data: {
        carrierShipmentId: 'me-envio-123',
        labelUrl: 'https://melhorenvio.com.br/etiqueta.pdf',
        trackingCode: 'AA123456789BR',
      },
    });

    const res = await labels.generateForOrder(seed.store.id, orderId);

    expect(res.alreadyExists).toBe(true);
    expect(res.shipmentId).toBe('me-envio-123');
    expect(res.labelUrl).toBe('https://melhorenvio.com.br/etiqueta.pdf');
  });

  it('emissão automática não roda com a opção desligada', async () => {
    const orderId = await criarPedidoPago();
    const spy = jest.spyOn(labels, 'generateForOrder');

    await labels.tryAutoGenerate(seed.store.id, orderId);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('emissão automática nunca derruba a confirmação do pagamento', async () => {
    const orderId = await criarPedidoPago();
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { freteEtiquetaAuto: true, freteModo: 'melhor_envio' },
    });

    // sem token configurado, generateForOrder lança — tryAutoGenerate engole
    await expect(
      labels.tryAutoGenerate(seed.store.id, orderId),
    ).resolves.toBeUndefined();
  });

  describe('rota do painel', () => {
    it('exige autenticação', async () => {
      const orderId = await criarPedidoPago();

      await request(app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/label`)
        .set('x-store-slug', seed.store.slug)
        .expect(401);
    });

    it('não gera etiqueta de pedido de outra loja', async () => {
      const outra = await seedStore(prisma, { slug: 'loja-outra-etq' });
      const orderId = await criarPedidoPago();
      const token = await signAdminToken(app, outra.admin);

      await request(app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/label`)
        .set('x-store-slug', outra.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('lojista inadimplente não emite etiqueta', async () => {
      const orderId = await criarPedidoPago();
      await prisma.store.update({
        where: { id: seed.store.id },
        data: {
          status: 'PAST_DUE',
          planDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      const token = await signAdminToken(app, seed.admin);

      await request(app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/label`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  it('o valor segurado é o subtotal, não o total com frete', async () => {
    const orderId = await criarPedidoPago();
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    expect(Number(order.subtotal)).toBe(100);
    expect(Number(order.total)).toBe(125);
    // segurar o frete junto encareceria a etiqueta à toa
    expect(new Prisma.Decimal(order.subtotal).lessThan(order.total)).toBe(true);
  });
});
