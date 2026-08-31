import { INestApplication } from '@nestjs/common';
import { PaymentStatus, Prisma, SellerDocType, StoreStatus } from '@prisma/client';
import request from 'supertest';
import { BillingCronService } from '../src/billing/billing-cron.service';
import { BillingService } from '../src/billing/billing.service';
import { MailService } from '../src/mail/mail.service';
import { ANTECEDENCIA_DIAS } from '../src/billing/pix-billing-rules';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  type SeededStore,
} from './helpers/test-app';

const DIA = 24 * 60 * 60 * 1000;

/*
 * Mensalidade paga por Pix.
 *
 * Pix recorrente não existe na API do Mercado Pago: preapproval só faz débito
 * no cartão. O ciclo é nosso — a cada mês geramos uma cobrança avulsa. O risco
 * dessa abordagem é cobrar duas vezes ou esquecer de cobrar, e é isso que
 * estes testes seguram.
 */
describe('Mensalidade por Pix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let billing: BillingService;
  let cron: BillingCronService;
  let seed: SeededStore;
  let adminToken: string;
  let enviados: { to: string; subject: string; text: string; html: string }[] = [];

  /** Requisições que a aplicação mandou para o Mercado Pago. */
  let chamadasMp: { url: string; body: Record<string, unknown> }[] = [];
  let fetchOriginal: typeof globalThis.fetch;
  let proximoIdPagamento = 1;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    billing = app.get(BillingService);
    cron = app.get(BillingCronService);
    fetchOriginal = globalThis.fetch;

    jest
      .spyOn(app.get(MailService), 'send')
      .mockImplementation(async (input) => {
        enviados.push(input as (typeof enviados)[number]);
        return { sent: true };
      });
  });

  afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.platformSettings.deleteMany({});
    chamadasMp = [];
    enviados = [];
    proximoIdPagamento = 1;

    process.env.PLATFORM_MP_ACCESS_TOKEN = 'TEST-token-da-plataforma';

    /*
     * O Mercado Pago é dublê: o que interessa testar é o que a aplicação
     * manda para ele e o que grava com a resposta, não a API deles.
     */
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.mercadopago.com')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        chamadasMp.push({ url, body });

        if (url.endsWith('/v1/payments')) {
          const id = proximoIdPagamento++;
          return new Response(
            JSON.stringify({
              id,
              status: 'pending',
              point_of_interaction: {
                transaction_data: {
                  qr_code: `00020126PIX-COPIA-E-COLA-${id}`,
                  qr_code_base64: 'iVBORw0KGgoAAAANSUhEUg==',
                },
              },
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return fetchOriginal(input, init);
    }) as typeof globalThis.fetch;

    seed = await seedStore(prisma);
    adminToken = await signAdminToken(app, seed.admin);

    // dados fiscais completos: o MP exige documento do pagador no Pix
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        sellerEmail: 'lojista@teste.local',
        sellerLegalName: 'Loja Teste LTDA',
        sellerDocType: SellerDocType.CNPJ,
        sellerDocument: '12345678000199',
        planDueAt: new Date(Date.now() + 2 * DIA),
      },
    });

    await prisma.platformPlan.upsert({
      where: { id: 'mensal' },
      update: { amount: new Prisma.Decimal(99.9), active: true },
      create: {
        id: 'mensal',
        name: 'Mensal',
        description: 'Plano mensal',
        amount: new Prisma.Decimal(99.9),
        periodDays: 30,
        active: true,
        order: 1,
      },
    });
  });

  /*
   * Preparo usa o serviço; a rota tem throttle de 10/min e a suíte inteira
   * sai do mesmo IP. Os testes que existem para verificar o endpoint chamam
   * por HTTP explicitamente.
   */
  const assinarPix = () => billing.subscribeWithPix(seed.store.id, 'mensal');

  const assinarPixHttp = () =>
    request(app.getHttpServer())
      .post('/api/billing/subscribe/pix')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: 'mensal' });

  const pagamentosPedidos = () =>
    chamadasMp.filter((c) => c.url.endsWith('/v1/payments'));

  describe('assinar por Pix', () => {
    it('a rota devolve o copia e cola e o QR', async () => {
      const res = await assinarPixHttp().expect(201);

      expect(res.body.copiaECola).toContain('PIX-COPIA-E-COLA');
      expect(res.body.qrCodeBase64).toBeTruthy();
      expect(Number(res.body.amount)).toBe(99.9);
      expect(res.body.expirada).toBe(false);
    });

    it('marca a loja como pagante por Pix', async () => {
      await assinarPix();

      const loja = await prisma.store.findUniqueOrThrow({
        where: { id: seed.store.id },
      });
      expect(loja.billingMethod).toBe('PIX');
    });

    it('manda ao Mercado Pago o documento e a referência da fatura', async () => {
      await assinarPix();

      const [chamada] = pagamentosPedidos();
      expect(chamada.body.payment_method_id).toBe('pix');
      expect(chamada.body.transaction_amount).toBe(99.9);
      expect((chamada.body.payer as { identification: unknown }).identification)
        .toEqual({ type: 'CNPJ', number: '12345678000199' });

      // é por external_reference que o webhook reencontra a fatura
      const fatura = await prisma.platformInvoice.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      expect(chamada.body.external_reference).toBe(fatura.id);
    });

    it('recusa sem CPF/CNPJ, explicando o que preencher', async () => {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { sellerDocument: null },
      });

      const res = await assinarPixHttp();
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/CPF ou CNPJ/i);
      expect(pagamentosPedidos()).toHaveLength(0);
    });

    it('falha do gateway não deixa fatura órfã para trás', async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/v1/payments')) {
          return new Response('erro do gateway', { status: 500 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as typeof globalThis.fetch;

      await assinarPixHttp().expect(400);

      // fatura sem cobrança bloquearia a próxima tentativa
      expect(
        await prisma.platformInvoice.count({ where: { storeId: seed.store.id } }),
      ).toBe(0);
    });
  });

  describe('não cobra duas vezes', () => {
    it('assinar de novo devolve a mesma cobrança', async () => {
      const primeira = await assinarPix();
      const segunda = await assinarPix();

      expect(segunda!.id).toBe(primeira!.id);
      expect(pagamentosPedidos()).toHaveLength(1);
      expect(
        await prisma.platformInvoice.count({ where: { storeId: seed.store.id } }),
      ).toBe(1);
    });

    it('cliques simultâneos geram uma cobrança só', async () => {
      /*
       * Checar-e-criar sem lock deixava dois cliques passarem juntos pela
       * verificação de "já tem cobrança aberta": saíam dois QR do mesmo mês e
       * o lojista podia pagar os dois.
       */
      await Promise.all(Array.from({ length: 6 }, () => assinarPix()));

      expect(pagamentosPedidos()).toHaveLength(1);
      expect(
        await prisma.platformInvoice.count({ where: { storeId: seed.store.id } }),
      ).toBe(1);
    });

    it('painel e varredura ao mesmo tempo também geram uma só', async () => {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { billingMethod: 'PIX', planDueAt: new Date(Date.now() + DIA) },
      });

      await Promise.all([
        billing.emitirCobrancaPix(seed.store.id),
        cron.emitirCobrancasPix(),
      ]);

      expect(pagamentosPedidos()).toHaveLength(1);
    });

    it('a varredura não gera outra com cobrança em aberto', async () => {
      await assinarPix();

      await cron.emitirCobrancasPix();

      expect(pagamentosPedidos()).toHaveLength(1);
    });

    it('QR expirado libera uma cobrança nova', async () => {
      await assinarPix();
      await prisma.platformInvoice.updateMany({
        where: { storeId: seed.store.id },
        data: { pixExpiresAt: new Date(Date.now() - DIA) },
      });

      await cron.emitirCobrancasPix();

      expect(pagamentosPedidos()).toHaveLength(2);
      expect(
        await prisma.platformInvoice.count({ where: { storeId: seed.store.id } }),
      ).toBe(2);
    });
  });

  describe('varredura do ciclo', () => {
    async function lojaPix(planDueAt: Date, status = StoreStatus.ACTIVE) {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { billingMethod: 'PIX', planDueAt, status },
      });
    }

    it('gera para quem está perto de vencer', async () => {
      await lojaPix(new Date(Date.now() + (ANTECEDENCIA_DIAS - 1) * DIA));

      const r = await cron.emitirCobrancasPix();

      expect(r.geradas).toBe(1);
      expect(pagamentosPedidos()).toHaveLength(1);
    });

    it('não gera para quem vence longe', async () => {
      await lojaPix(new Date(Date.now() + 25 * DIA));

      const r = await cron.emitirCobrancasPix();

      expect(r.geradas).toBe(0);
      expect(pagamentosPedidos()).toHaveLength(0);
    });

    it('não gera para quem paga no cartão', async () => {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { billingMethod: 'CARD', planDueAt: new Date(Date.now() + DIA) },
      });

      const r = await cron.emitirCobrancasPix();

      expect(r.geradas).toBe(0);
      expect(pagamentosPedidos()).toHaveLength(0);
    });

    it('loja com cadastro incompleto não derruba a varredura das outras', async () => {
      await lojaPix(new Date(Date.now() + DIA));
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { sellerDocument: null },
      });

      const outra = await seedStore(prisma, { slug: 'loja-pix-ok' });
      await prisma.store.update({
        where: { id: outra.store.id },
        data: {
          billingMethod: 'PIX',
          planDueAt: new Date(Date.now() + DIA),
          sellerEmail: 'outra@teste.local',
          sellerDocType: SellerDocType.CPF,
          sellerDocument: '39053344705',
        },
      });

      const r = await cron.emitirCobrancasPix();

      expect(r.geradas).toBe(1);
      const faturas = await prisma.platformInvoice.findMany({
        select: { storeId: true },
      });
      expect(faturas.map((f) => f.storeId)).toEqual([outra.store.id]);
    });
  });

  describe('baixa do pagamento', () => {
    it('empurra o vencimento e reativa a loja', async () => {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: {
          status: StoreStatus.PAST_DUE,
          planDueAt: new Date(Date.now() - 2 * DIA),
        },
      });
      await assinarPix();

      const fatura = await prisma.platformInvoice.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });

      // o webhook do MP responde o pagamento apontando para a fatura
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/payments/')) {
          return new Response(
            JSON.stringify({
              id: 987654,
              status: 'approved',
              external_reference: fatura.id,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as typeof globalThis.fetch;

      await billing.handleWebhook({ type: 'payment', data: { id: '987654' } });

      const paga = await prisma.platformInvoice.findUniqueOrThrow({
        where: { id: fatura.id },
      });
      expect(paga.status).toBe(PaymentStatus.APPROVED);
      expect(paga.paidAt).toBeInstanceOf(Date);

      const loja = await prisma.store.findUniqueOrThrow({
        where: { id: seed.store.id },
      });
      expect(loja.status).toBe(StoreStatus.ACTIVE);
      expect(loja.planDueAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('depois de paga, a varredura gera o ciclo seguinte', async () => {
      await assinarPix();
      await prisma.platformInvoice.updateMany({
        where: { storeId: seed.store.id },
        data: { status: PaymentStatus.APPROVED, paidAt: new Date() },
      });
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { planDueAt: new Date(Date.now() + DIA) },
      });

      const r = await cron.emitirCobrancasPix();

      expect(r.geradas).toBe(1);
      expect(
        await prisma.platformInvoice.count({ where: { storeId: seed.store.id } }),
      ).toBe(2);
    });
  });

  describe('avisos por e-mail', () => {
    const esperarEmail = async (trecho: string, timeoutMs = 5000) => {
      const limite = Date.now() + timeoutMs;
      while (Date.now() < limite) {
        if (enviados.some((m) => m.subject.includes(trecho))) return;
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    it('avisa quando a cobrança é gerada, com o copia e cola no corpo', async () => {
      await assinarPix();
      await esperarEmail('disponível');

      const email = enviados.find((m) => m.subject.includes('disponível'));
      expect(email).toBeDefined();
      expect(email!.to).toBe('lojista@teste.local');
      // pagar não pode exigir login
      expect(email!.text).toContain('PIX-COPIA-E-COLA');
      expect(email!.text).toContain('99,90');
    });

    it('sem e-mail fiscal, usa o do admin — na cobrança e no aviso', async () => {
      await prisma.store.update({
        where: { id: seed.store.id },
        data: { sellerEmail: null },
      });

      await assinarPix();
      await esperarEmail('disponível');

      // o pagador enviado ao Mercado Pago
      const [chamada] = pagamentosPedidos();
      expect((chamada.body.payer as { email: string }).email).toBe(
        seed.admin.email,
      );

      const email = enviados.find((m) => m.subject.includes('disponível'));
      expect(email!.to).toBe(seed.admin.email);
    });

    it('confirma o pagamento com o novo vencimento', async () => {
      await assinarPix();
      const fatura = await prisma.platformInvoice.findFirstOrThrow({
        where: { storeId: seed.store.id },
      });
      enviados = [];

      globalThis.fetch = (async (input: RequestInfo | URL) => {
        if (String(input).includes('/v1/payments/')) {
          return new Response(
            JSON.stringify({
              id: 555,
              status: 'approved',
              external_reference: fatura.id,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as typeof globalThis.fetch;

      await billing.handleWebhook({ type: 'payment', data: { id: '555' } });
      await esperarEmail('confirmada');

      const email = enviados.find((m) => m.subject.includes('confirmada'));
      expect(email).toBeDefined();
      // e-mail de confirmação não repete o código de pagamento
      expect(email!.text).not.toContain('PIX-COPIA-E-COLA');
    });

    it('lembra uma vez quando a fatura vence', async () => {
      await assinarPix();
      await prisma.platformInvoice.updateMany({
        where: { storeId: seed.store.id },
        data: { dueAt: new Date(Date.now() - 2 * DIA) },
      });
      enviados = [];

      await cron.lembrarVencidas();
      await esperarEmail('vencendo');
      expect(
        enviados.filter((m) => m.subject.includes('vencendo')),
      ).toHaveLength(1);

      // a segunda passagem não pode insistir
      await cron.lembrarVencidas();
      expect(
        enviados.filter((m) => m.subject.includes('vencendo')),
      ).toHaveLength(1);
    });

    it('não lembra de fatura que ainda não venceu', async () => {
      await assinarPix();
      enviados = [];

      const r = await cron.lembrarVencidas();

      expect(r.enviados).toBe(0);
    });
  });

  describe('isolamento entre lojas', () => {
    it('admin de uma loja não vê nem gera cobrança de outra', async () => {
      await assinarPix();

      const vizinha = await seedStore(prisma, { slug: 'loja-vizinha-pix' });
      const tokenVizinho = await signAdminToken(app, vizinha.admin);

      // o header aponta para a loja vizinha; o token é do admin dela
      const res = await request(app.getHttpServer())
        .get('/api/billing/pix/atual')
        .set('x-store-slug', vizinha.store.slug)
        .set('Authorization', `Bearer ${tokenVizinho}`)
        .expect(200);

      // não pode enxergar o QR da loja do vizinho
      expect(res.body).toEqual({});
    });

    it('o slug do header não escolhe a loja — quem manda é o token', async () => {
      /*
       * A loja vizinha está com o cadastro completo de propósito: se o header
       * mandasse, a cobrança sairia para a loja do seed. Tem que sair para a
       * loja do token, sempre.
       */
      const vizinha = await seedStore(prisma, { slug: 'loja-vizinha-pix-2' });
      await prisma.store.update({
        where: { id: vizinha.store.id },
        data: {
          sellerEmail: 'vizinha@teste.local',
          sellerDocType: SellerDocType.CPF,
          sellerDocument: '39053344705',
          planDueAt: new Date(Date.now() + DIA),
        },
      });
      const tokenVizinho = await signAdminToken(app, vizinha.admin);

      await request(app.getHttpServer())
        .post('/api/billing/pix/gerar')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${tokenVizinho}`)
        .expect(201);

      const faturas = await prisma.platformInvoice.findMany({
        select: { storeId: true },
      });
      expect(faturas.map((f) => f.storeId)).toEqual([vizinha.store.id]);
    });
  });

  describe('painel', () => {
    it('mostra a cobrança em aberto sem criar outra', async () => {
      await assinarPix();

      const res = await request(app.getHttpServer())
        .get('/api/billing/pix/atual')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.copiaECola).toContain('PIX-COPIA-E-COLA');
      expect(pagamentosPedidos()).toHaveLength(1);
    });

    it('sem cobrança aberta devolve vazio', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/pix/atual')
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({});
    });
  });
});
