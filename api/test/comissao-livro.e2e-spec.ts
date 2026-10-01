import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { urlParaPg } from '../src/fila/fila';
import { FilaPgBoss } from '../src/fila/fila-pgboss';
import { TravasService } from '../src/fila/travas.service';
import { ConciliacaoComissaoService } from '../src/payments/conciliacao-comissao.service';
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
 * Livro da comissão (fase 3 do split).
 *
 * O webhook do Mercado Pago só avisa "olhe o pagamento X"; a conciliação
 * relê o pagamento e lança no livro o que o MP de fato reteve. Aqui: a
 * cobrança entra uma vez só, o estorno devolve a comissão, divergência
 * acende o alerta e a varredura pega o que ficou para trás.
 */
describe('Livro da comissão (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let customerToken: string;
  let fetchOriginal: typeof globalThis.fetch;
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
    pagamentosMp = {};
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const consulta = url.match(/\/v1\/payments\/([^/?]+)$/);
      if (consulta) {
        const pgto = pagamentosMp[decodeURIComponent(consulta[1])];
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
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { mpAccessToken: 'TEST-token-da-loja' },
    });
    customerToken = await signCustomerToken(app, seed.customer);
  });

  /** Pedido com a comissão já fotografada (como faz o pagamento). */
  async function pedidoComComissao(feeCents = 180) {
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
    const order = await prisma.order.update({
      where: { id: res.body.id as string },
      data: {
        platformFeeBps: 200,
        platformFeeBaseCents: 9000,
        platformFeeCents: feeCents,
      },
    });
    return order;
  }

  function pagamento(
    orderId: string,
    total: number,
    extra: Record<string, unknown> = {},
  ) {
    const id = `mp-${Math.random().toString(36).slice(2, 10)}`;
    pagamentosMp[id] = {
      id,
      status: 'approved',
      external_reference: orderId,
      transaction_amount: total,
      fee_details: [
        { type: 'mercadopago_fee', amount: 4.99 },
        { type: 'application_fee', amount: 1.8 },
      ],
      ...extra,
    };
    return id;
  }

  const notificar = (paymentId: string) =>
    request(app.getHttpServer())
      .post(
        `/api/payments/webhooks/mercadopago?secret=${SECRET}&store=${seed.store.id}`,
      )
      .send({ type: 'payment', data: { id: paymentId } })
      .expect((r) => {
        if (r.status >= 300) throw new Error(`webhook ${r.status}`);
      });

  const livro = (orderId: string) =>
    prisma.platformFeeEntry.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

  it('pagamento aprovado lança a cobrança uma vez só, mesmo com webhook repetido', async () => {
    const order = await pedidoComComissao();
    const pid = pagamento(order.id, Number(order.total));

    await notificar(pid);
    await notificar(pid);
    await notificar(pid);

    const lancs = await livro(order.id);
    expect(lancs).toHaveLength(1);
    expect(lancs[0]).toMatchObject({
      type: 'CHARGE',
      amountCents: 180,
      storeId: seed.store.id,
      mpPaymentId: pid,
      idempotencyKey: `charge:${pid}`,
    });
    const atualizado = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(atualizado.platformFeeChargedCents).toBe(180);
    expect(atualizado.platformFeeMismatch).toBe(false);
  });

  it('reembolso total devolve a comissão e o saldo do pedido zera', async () => {
    const order = await pedidoComComissao();
    const total = Number(order.total);
    const pid = pagamento(order.id, total);
    await notificar(pid);

    pagamentosMp[pid].status = 'refunded';
    pagamentosMp[pid].transaction_amount_refunded = total;
    pagamentosMp[pid].refunds = [{ id: 77, amount: total, status: 'approved' }];
    await notificar(pid);
    await notificar(pid);

    const lancs = await livro(order.id);
    expect(lancs.map((l) => l.type)).toEqual(['CHARGE', 'REFUND']);
    expect(lancs.reduce((s, l) => s + l.amountCents, 0)).toBe(0);
  });

  it('Mercado Pago reteve valor diferente do fotografado: acende a divergência', async () => {
    const order = await pedidoComComissao(180);
    const pid = pagamento(order.id, Number(order.total), {
      fee_details: [{ type: 'application_fee', amount: 1.0 }],
    });
    await notificar(pid);

    const atualizado = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(atualizado.platformFeeMismatch).toBe(true);
    // o livro registra o dinheiro de verdade, não o esperado
    expect((await livro(order.id))[0].amountCents).toBe(100);
  });

  it('cliente da loja nunca recebe os dados da comissão', async () => {
    const order = await pedidoComComissao();
    const pid = pagamento(order.id, Number(order.total));
    await notificar(pid);

    const detalhe = await request(app.getHttpServer())
      .get(`/api/storefront/orders/${order.id}`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const lista = await request(app.getHttpServer())
      .get('/api/storefront/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    for (const corpo of [detalhe.text, lista.text]) {
      expect(corpo).not.toMatch(/platformFee/);
    }
  });

  it('pedido sem comissão não gera lançamento', async () => {
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
    const pid = pagamento(res.body.id as string, 125);
    await notificar(pid);
    expect(await livro(res.body.id as string)).toHaveLength(0);
  });

  it('varredura de segurança concilia pedido pago que ficou sem lançamento', async () => {
    const order = await pedidoComComissao();
    const pid = pagamento(order.id, Number(order.total));
    // Simula webhook perdido: pedido pago, sem conciliação, há 1 hora
    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId: pid,
        paymentStatus: PaymentStatus.APPROVED,
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const n = await app.get(ConciliacaoComissaoService).varrer();
    expect(n).toBe(1);
    expect(await livro(order.id)).toHaveLength(1);
    // já conciliado: a próxima rodada não pega de novo
    expect(await app.get(ConciliacaoComissaoService).varrer()).toBe(0);
  });

  it('trava: com dois processos, só um roda a varredura', async () => {
    const config = app.get(ConfigService);
    const a = new TravasService(config);
    const b = new TravasService(config);
    try {
      let liberar!: () => void;
      let entrou!: () => void;
      const segurando = new Promise<void>((r) => (liberar = r));
      const aDentro = new Promise<void>((r) => (entrou = r));
      const rodadaA = a.seLivre('teste-trava', async () => {
        entrou();
        await segurando;
        return 'a';
      });
      await aDentro;
      expect(await b.seLivre('teste-trava', async () => 'b')).toBeUndefined();
      liberar();
      expect(await rodadaA).toBe('a');
      // solta ao terminar
      expect(await b.seLivre('teste-trava', async () => 'b')).toBe('b');
    } finally {
      await a.onModuleDestroy();
      await b.onModuleDestroy();
    }
  });

  it('pg-boss de verdade: tarefa enviada é executada', async () => {
    const fila = new FilaPgBoss(urlParaPg(process.env.DATABASE_URL as string));
    try {
      const marca = `pg-${Date.now()}`;
      const chegou = new Promise<unknown>((resolve) => {
        void fila.trabalhar<{ storeId: string; paymentId: string }>(
          'comissao.conciliar',
          async (d) => {
            // sobras de rodadas anteriores do teste também passam por aqui
            if (d.paymentId === marca) resolve(d);
          },
        );
      });
      await fila.enviar('comissao.conciliar', {
        storeId: 'loja-x',
        paymentId: marca,
      });
      expect(await chegou).toEqual({ storeId: 'loja-x', paymentId: marca });
    } finally {
      await fila.parar();
    }
  }, 60_000);
});
