import { INestApplication } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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
 * Webhook de pagamento das lojas.
 *
 * Os testes de segurança já cobriam quem pode chamar. Aqui é o efeito: uma
 * notificação do Mercado Pago tem que virar pedido pago, estoque certo e
 * e-mail enviado — e a mesma notificação chegando duas vezes (o MP reenvia
 * quando não recebe 200 na hora) não pode dobrar nada.
 */
describe('Webhook de pagamento (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let customerToken: string;
  let fetchOriginal: typeof globalThis.fetch;

  /** Pagamentos que o Mercado Pago "conhece", por id. */
  let pagamentosMp: Record<string, Record<string, unknown>> = {};
  let consultasMp: string[] = [];

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
    pagamentosMp = {};
    consultasMp = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const consulta = url.match(/\/v1\/payments\/([^/?]+)/);
      if (consulta) {
        consultasMp.push(consulta[1]);
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

    seed = await seedStore(prisma, { stock: 5 });
    // sem token de MP a loja nem é considerada na resolução do webhook
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { mpAccessToken: 'TEST-token-da-loja' },
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
    return res.body.id as string;
  }

  /** Ensina o dublê do MP sobre um pagamento e devolve o id. */
  function registrarPagamento(
    orderId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    const id = `mp-${Math.random().toString(36).slice(2, 10)}`;
    pagamentosMp[id] = {
      id,
      status,
      external_reference: orderId,
      transaction_amount: 125,
      ...extra,
    };
    return id;
  }

  const notificar = (paymentId: string, storeId?: string) =>
    request(app.getHttpServer())
      .post(
        `/api/payments/webhooks/mercadopago?secret=${SECRET}` +
          (storeId ? `&store=${storeId}` : ''),
      )
      .send({ type: 'payment', data: { id: paymentId } });

  describe('pagamento aprovado', () => {
    it('marca o pedido como pago', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      await notificar(pid, seed.store.id).expect(201);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.paymentStatus).toBe(PaymentStatus.APPROVED);
      expect(pedido.status).toBe(OrderStatus.PAID);
      expect(pedido.paidAt).toBeInstanceOf(Date);
      expect(pedido.mpPaymentId).toBe(pid);
    });

    it('não devolve o estoque — a peça foi vendida', async () => {
      const antes = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      await notificar(pid, seed.store.id).expect(201);

      const depois = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;
      // o checkout já tinha reservado; a aprovação confirma a baixa
      expect(depois).toBe(antes - 1);
    });

    it('a mesma notificação duas vezes não muda nada', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      await notificar(pid, seed.store.id).expect(201);
      const primeiro = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      await notificar(pid, seed.store.id).expect(201);
      const segundo = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      // o MP reenvia quando não recebe 200 na hora
      expect(segundo.paidAt!.getTime()).toBe(primeiro.paidAt!.getTime());
      expect(segundo.status).toBe(OrderStatus.PAID);

      const produto = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(produto.stock).toBe(4);
    });
  });

  describe('pagamento recusado', () => {
    it('não marca como pago', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'rejected');

      await notificar(pid, seed.store.id).expect(201);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.paymentStatus).not.toBe(PaymentStatus.APPROVED);
      expect(pedido.status).not.toBe(OrderStatus.PAID);
      expect(pedido.paidAt).toBeNull();
    });
  });

  describe('estorno feito no painel do Mercado Pago', () => {
    it('marca o pedido como reembolsado e devolve o estoque', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');
      await notificar(pid, seed.store.id).expect(201);

      pagamentosMp[pid].status = 'refunded';
      await notificar(pid, seed.store.id).expect(201);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.status).toBe(OrderStatus.REFUNDED);
      expect(pedido.paymentStatus).toBe(PaymentStatus.REFUNDED);
      // origem registrada: veio de fora, não fomos nós que disparamos
      expect(pedido.refundVia).toBe('GATEWAY_EXTERNAL');

      const produto = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(produto.stock).toBe(5);
    });

    it('estorno notificado duas vezes não devolve estoque em dobro', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');
      await notificar(pid, seed.store.id).expect(201);

      pagamentosMp[pid].status = 'refunded';
      await notificar(pid, seed.store.id).expect(201);
      await notificar(pid, seed.store.id).expect(201);

      const produto = await prisma.product.findUniqueOrThrow({
        where: { id: seed.product.id },
      });
      expect(produto.stock).toBe(5);
    });
  });

  describe('resolução da loja', () => {
    it('sem ?store= ainda acha o pedido, varrendo as lojas', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      await notificar(pid).expect(201);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.paymentStatus).toBe(PaymentStatus.APPROVED);
    });

    it('notificação de pagamento desconhecido é ignorada sem erro', async () => {
      const res = await notificar('pagamento-que-nao-existe', seed.store.id);

      expect(res.status).toBe(201);
      expect(
        await prisma.order.count({ where: { paidAt: { not: null } } }),
      ).toBe(0);
    });

    it('pedido de uma loja não é afetado pelo ?store= de outra', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      const vizinha = await seedStore(prisma, { slug: 'loja-vizinha-webhook' });
      await prisma.store.update({
        where: { id: vizinha.store.id },
        data: { mpAccessToken: 'TEST-token-vizinha' },
      });

      /*
       * O hint aponta para a loja errada. O handler tem que confirmar o
       * pedido pelo external_reference, não confiar no parâmetro da URL —
       * senão bastaria adivinhar um id para mexer no pedido do vizinho.
       */
      await notificar(pid, vizinha.store.id).expect(201);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.storeId).toBe(seed.store.id);
    });
  });

  describe('autenticação', () => {
    it('sem segredo não processa nada', async () => {
      const orderId = await criarPedido();
      const pid = registrarPagamento(orderId, 'approved');

      await request(app.getHttpServer())
        .post('/api/payments/webhooks/mercadopago')
        .send({ type: 'payment', data: { id: pid } })
        .expect(401);

      const pedido = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(pedido.paidAt).toBeNull();
      // nem chegou a consultar o Mercado Pago
      expect(consultasMp).toHaveLength(0);
    });
  });
});
