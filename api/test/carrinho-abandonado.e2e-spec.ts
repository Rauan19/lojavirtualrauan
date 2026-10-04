import { INestApplication } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { CarrinhoAbandonadoService } from '../src/orders/carrinho-abandonado.service';
import { OrdersService } from '../src/orders/orders.service';
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
 * Carrinho abandonado: pedido que expirou sem pagamento vira um lembrete por
 * e-mail (um só) com link que devolve os itens à sacola, e aparece no painel.
 */
describe('Carrinho abandonado (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let customerToken: string;
  let adminToken: string;
  let enviados: { to: string; subject: string; text: string }[] = [];

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    jest
      .spyOn(app.get(MailService), 'send')
      .mockImplementation(async (input) => {
        const e = input as { to: string; subject: string; text: string };
        // só o lembrete conta (o "pedido recebido" também passa por aqui)
        if (/esqueceu itens/.test(e.subject)) enviados.push(e);
        return { sent: true };
      });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    enviados = [];
    seed = await seedStore(prisma, { stock: 5 });
    customerToken = await signCustomerToken(app, seed.customer);
    adminToken = await signAdminToken(app, seed.admin);
  });

  async function pedidoQueExpirou() {
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 2 }],
        shippingAddress: ADDRESS,
        shippingOptionId: 'padrao',
        acceptTerms: true,
      })
      .expect(201);
    const id = res.body.id as string;
    // passou mais de 1h sem pagar
    await prisma.order.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    await app.get(OrdersService).expireAbandonedUnpaidOrders();
    return prisma.order.findUniqueOrThrow({ where: { id } });
  }

  const varrer = () => app.get(CarrinhoAbandonadoService).varrer();

  it('pedido que expirou recebe um lembrete só, com o link de volta', async () => {
    const pedido = await pedidoQueExpirou();
    expect(pedido.expiredUnpaidAt).not.toBeNull();

    expect(await varrer()).toBe(1);
    expect(await varrer()).toBe(0);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe(seed.customer.email);
    expect(enviados[0].subject).toMatch(/esqueceu itens na sacola/);
    expect(enviados[0].text).toMatch(/checkout\?recuperar=/);

    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.id },
    });
    expect(depois.recoveryEmailSentAt).not.toBeNull();
  });

  it('o link devolve os itens; link adulterado é recusado', async () => {
    const pedido = await pedidoQueExpirou();
    const token = app.get(CarrinhoAbandonadoService).token(pedido.id);

    const ok = await request(app.getHttpServer())
      .get(`/api/storefront/recuperar-carrinho/${encodeURIComponent(token)}`)
      .set('x-store-slug', seed.store.slug)
      .expect(200);
    expect(ok.body.itens).toEqual([
      expect.objectContaining({ productId: seed.product.id, quantity: 2 }),
    ]);

    await request(app.getHttpServer())
      .get(`/api/storefront/recuperar-carrinho/${pedido.id}.assinatura-falsa`)
      .set('x-store-slug', seed.store.slug)
      .expect(400);

    // o link de uma loja não abre em outra
    const outra = await seedStore(prisma);
    await request(app.getHttpServer())
      .get(`/api/storefront/recuperar-carrinho/${encodeURIComponent(token)}`)
      .set('x-store-slug', outra.store.slug)
      .expect(404);
  });

  it('quem já voltou e comprou não recebe lembrete e aparece como recuperado', async () => {
    const pedido = await pedidoQueExpirou();
    await prisma.order.create({
      data: {
        storeId: seed.store.id,
        customerId: seed.customer.id,
        orderNumber: '999001',
        customerName: 'Cliente',
        customerEmail: seed.customer.email,
        subtotal: 100,
        total: 100,
        paymentStatus: PaymentStatus.APPROVED,
      },
    });

    expect(await varrer()).toBe(0);
    const painel = await request(app.getHttpServer())
      .get('/api/admin/carrinhos-abandonados')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(painel.body.recuperados).toBe(1);
    expect(painel.body.carrinhos[0]).toMatchObject({
      id: pedido.id,
      recuperadoNoPedido: '999001',
    });
  });

  it('painel: período, situação, busca e páginas no servidor', async () => {
    const agora = Date.now();
    const hora = 60 * 60 * 1000;
    // 25 carrinhos nos últimos dias e 1 de 40 dias atrás
    for (let i = 1; i <= 26; i++) {
      const dias = i === 26 ? 40 : i % 5;
      await prisma.order.create({
        data: {
          storeId: seed.store.id,
          orderNumber: `7${String(i).padStart(5, '0')}`,
          customerName: `Cliente ${String(i).padStart(2, '0')}`,
          customerEmail: `cliente${i}@teste.local`,
          customerPhone: `7599900${String(i).padStart(4, '0')}`,
          // o 1º é do cliente semeado, que depois compra (recuperado)
          customerId: i === 1 ? seed.customer.id : null,
          subtotal: 90,
          total: 100,
          createdAt: new Date(agora - dias * 24 * hora - 2 * hora),
          expiredUnpaidAt: new Date(agora - dias * 24 * hora - hora),
          recoveryEmailSentAt: i % 2 === 0 ? new Date(agora) : null,
        },
      });
    }
    await prisma.order.create({
      data: {
        storeId: seed.store.id,
        customerId: seed.customer.id,
        orderNumber: '799999',
        customerName: 'Cliente 01',
        customerEmail: 'cliente1@teste.local',
        subtotal: 150,
        total: 150,
        paymentStatus: PaymentStatus.APPROVED,
      },
    });

    const get = (q: string) =>
      request(app.getHttpServer())
        .get(`/api/admin/carrinhos-abandonados?${q}`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`);

    let r = await get('').expect(200);
    expect(r.body.dias).toBe(30);
    expect(r.body.resumo).toMatchObject({
      total: 25,
      recuperados: 1,
      taxa: 4,
      valorEmAberto: 2400,
      valorRecuperado: 150,
    });
    expect(r.body.contagens).toEqual({
      todos: 25,
      pendentes: 24,
      recuperados: 1,
      semLembrete: 12,
    });
    expect(r.body.paginacao).toMatchObject({ total: 25, totalPaginas: 2 });
    expect(r.body.carrinhos).toHaveLength(20);
    // a página só traz os itens dela
    r = await get('porPagina=10&pagina=3').expect(200);
    expect(r.body.carrinhos).toHaveLength(5);

    r = await get('situacao=recuperados').expect(200);
    expect(r.body.carrinhos.map((c: { cliente: string }) => c.cliente)).toEqual(
      ['Cliente 01'],
    );
    expect(r.body.carrinhos[0].recuperadoNoPedido).toBe('799999');

    r = await get('situacao=sem-lembrete').expect(200);
    expect(r.body.paginacao.total).toBe(12);

    // busca por nome, e-mail, telefone ou número do pedido
    r = await get('busca=cliente%2007').expect(200);
    expect(r.body.paginacao.total).toBe(1);
    r = await get('busca=700012').expect(200);
    expect(r.body.carrinhos[0].orderNumber).toBe('700012');

    r = await get('dias=90').expect(200);
    expect(r.body.resumo.total).toBe(26);
    await get('dias=15').expect(400);
  });

  it('lojista desliga o e-mail automático', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/carrinhos-abandonados/config')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emailAutomatico: false })
      .expect(200);
    await pedidoQueExpirou();
    expect(await varrer()).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it('cliente não vê a lista do painel', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/carrinhos-abandonados')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});
