import { INestApplication } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';
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
 * Desconto no Pix: o valor sai do servidor (nunca do navegador), só vale no
 * Pix, e quando o Pix é pago o desconto entra no pedido uma vez só.
 */
describe('Desconto no Pix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let customerToken: string;
  let fetchOriginal: typeof globalThis.fetch;
  let enviadoAoMp: Record<string, unknown>[] = [];
  let pagamentosMp: Record<string, Record<string, unknown>> = {};

  const SECRET = process.env.MP_WEBHOOK_SECRET;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchOriginal = globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    enviadoAoMp = [];
    pagamentosMp = {};
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith('/v1/payments') && init?.method === 'POST') {
        const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
        enviadoAoMp.push(corpo);
        return new Response(
          JSON.stringify({
            id: 777,
            status: 'pending',
            point_of_interaction: {},
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      const consulta = url.match(/\/v1\/payments\/([^/?]+)$/);
      if (consulta) {
        const pgto = pagamentosMp[consulta[1]];
        if (!pgto) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify(pgto), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('api.mercadopago.com')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return fetchOriginal(input, init);
    }) as typeof globalThis.fetch;

    seed = await seedStore(prisma, {
      stock: 5,
      price: 100,
      freteValorFixo: 20,
    });
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { mpAccessToken: 'TEST-token-da-loja', pixDiscountPercent: 5 },
    });
    customerToken = await signCustomerToken(app, seed.customer);
  });

  async function criarPedido() {
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingOptionId: 'padrao',
        acceptTerms: true,
      })
      .expect(201);
    return prisma.order.findUniqueOrThrow({
      where: { id: res.body.id as string },
    });
  }

  const pagar = (orderId: string, metodo: string) =>
    request(app.getHttpServer())
      .post(`/api/checkout/orders/${orderId}/pay-brick`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        formData: {
          payment_method_id: metodo,
          payer: { email: 'cliente@teste.local' },
          ...(metodo === 'pix' ? {} : { token: 'tok', installments: 1 }),
        },
      });

  const notificar = (paymentId: string) =>
    request(app.getHttpServer())
      .post(
        `/api/payments/webhooks/mercadopago?secret=${SECRET}&store=${seed.store.id}`,
      )
      .send({ type: 'payment', data: { id: paymentId } });

  it('Pix cobra com 5% de desconto nos produtos (frete fora)', async () => {
    const pedido = await criarPedido();
    expect(Number(pedido.total)).toBe(120);
    await pagar(pedido.id, 'pix').expect(201);

    // R$ 100 de produtos → R$ 5 de desconto; frete de R$ 20 sem desconto
    expect(enviadoAoMp[0].transaction_amount).toBe(115);
    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.id },
    });
    expect(Number(depois.pixDiscount)).toBe(5);
    // total do pedido só muda quando o Pix for pago
    expect(Number(depois.total)).toBe(120);
  });

  it('cartão cobra o preço cheio', async () => {
    const pedido = await criarPedido();
    await pagar(pedido.id, 'visa').expect(201);
    expect(enviadoAoMp[0].transaction_amount).toBe(120);
  });

  it('Pix pago: confirma o pedido e o desconto entra no total uma vez só', async () => {
    const pedido = await criarPedido();
    await pagar(pedido.id, 'pix').expect(201);
    pagamentosMp['pix-1'] = {
      id: 'pix-1',
      status: 'approved',
      payment_method_id: 'pix',
      external_reference: pedido.id,
      transaction_amount: 115,
    };

    await notificar('pix-1').expect(201);
    await notificar('pix-1').expect(201);

    const pago = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.id },
    });
    expect(pago.paymentStatus).toBe(PaymentStatus.APPROVED);
    expect(pago.pixDiscountApplied).toBe(true);
    expect(Number(pago.total)).toBe(115);
    expect(Number(pago.discount)).toBe(5);
  });

  it('pagamento abaixo do valor com desconto não libera o pedido', async () => {
    const pedido = await criarPedido();
    await pagar(pedido.id, 'pix').expect(201);
    pagamentosMp['pix-2'] = {
      id: 'pix-2',
      status: 'approved',
      payment_method_id: 'pix',
      external_reference: pedido.id,
      transaction_amount: 100,
    };
    await notificar('pix-2').expect(201);
    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.id },
    });
    expect(depois.paymentStatus).not.toBe(PaymentStatus.APPROVED);
    expect(depois.pixDiscountApplied).toBe(false);
  });

  it('loja sem desconto configurado: Pix pelo preço cheio', async () => {
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { pixDiscountPercent: 0 },
    });
    const pedido = await criarPedido();
    await pagar(pedido.id, 'pix').expect(201);
    expect(enviadoAoMp[0].transaction_amount).toBe(120);
  });

  it('vitrine recebe o % do desconto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}`)
      .expect(200);
    expect(res.body.pixDiscountPercent).toBe(5);
  });
});
