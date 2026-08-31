import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
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

type SentMail = { to: string; subject: string; text: string; html?: string };

/**
 * O cliente precisa receber prova da compra. Sem isso vira suporte e
 * contestação no cartão.
 */
describe('E-mails transacionais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let seed: SeededStore;
  let token: string;
  let sent: SentMail[];

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    orders = app.get(OrdersService);

    // Sem SMTP nos testes: intercepta o envio e guarda o que sairia
    const mail = app.get(MailService);
    jest.spyOn(mail, 'send').mockImplementation(async (input) => {
      sent.push(input as SentMail);
      return { sent: true };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    sent = [];
    await resetDb(prisma);
    seed = await seedStore(prisma, { stock: 5, price: 100 });
    token = await signCustomerToken(app, seed.customer);
  });

  const criarPedido = () =>
    request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 2 }],
        shippingAddress: ADDRESS,
        shippingMethod: 'Entrega padrão',
        acceptTerms: true,
        shippingOptionId: 'padrao',
      })
      .expect(201);

  /** Os e-mails saem em background (void), então damos um tick ao event loop. */
  /*
   * O envio é disparado com `void` — fire-and-forget, para e-mail que falha
   * não derrubar o checkout. Esperar um tempo fixo tornava o teste refém da
   * carga da máquina: passava sozinho e falhava na suíte inteira. Aqui a
   * espera é pelo fato (o e-mail entrou na caixa), com teto de tempo.
   */
  const aguardarEmail = async (trecho: string, timeoutMs = 5000) => {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (sent.some((m) => m.subject.includes(trecho))) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  /** Espera a fila drenar quando o teste quer provar que NADA foi enviado. */
  const aguardarEnvio = () => new Promise((r) => setTimeout(r, 300));

  it('avisa o cliente assim que o pedido é criado', async () => {
    const res = await criarPedido();
    await aguardarEmail('Recebemos seu pedido');

    const email = sent.find((m) => m.subject.includes('Recebemos seu pedido'));
    expect(email).toBeDefined();
    expect(email!.to).toBe(seed.customer.email);
    expect(email!.subject).toContain(res.body.orderNumber);
    expect(email!.text).toContain('Camiseta Teste');
    // 2 x 100 + 25 de frete
    expect(email!.text).toContain('225');
  });

  it('avisa quando o pagamento é aprovado', async () => {
    const res = await criarPedido();
    sent = [];

    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-email-1');
    await aguardarEmail('Pagamento aprovado');

    const email = sent.find((m) => m.subject.includes('Pagamento aprovado'));
    expect(email).toBeDefined();
    expect(email!.to).toBe(seed.customer.email);
    expect(email!.html).toContain('Pagamento aprovado');
  });

  it('não manda o e-mail de aprovado duas vezes no webhook duplicado', async () => {
    const res = await criarPedido();
    sent = [];

    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-email-2');
    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-email-2');
    await aguardarEmail('Pagamento aprovado');
    await aguardarEnvio();

    const aprovados = sent.filter((m) =>
      m.subject.includes('Pagamento aprovado'),
    );
    expect(aprovados).toHaveLength(1);
  });

  it('escapa HTML vindo do nome do produto', async () => {
    await prisma.product.update({
      where: { id: seed.product.id },
      data: { name: '<script>alert(1)</script>' },
    });

    await criarPedido();
    await aguardarEmail('Recebemos seu pedido');

    const email = sent.find((m) => m.subject.includes('Recebemos seu pedido'));
    expect(email!.html).not.toContain('<script>');
    expect(email!.html).toContain('&lt;script&gt;');
  });

  it('e-mail que falha não derruba o checkout', async () => {
    const mail = app.get(MailService);
    const spy = jest
      .spyOn(mail, 'send')
      .mockRejectedValueOnce(new Error('SMTP fora do ar'));

    await criarPedido();
    await aguardarEnvio();

    spy.mockImplementation(async (input) => {
      sent.push(input as SentMail);
      return { sent: true };
    });

    const total = await prisma.order.count({ where: { storeId: seed.store.id } });
    expect(total).toBe(1);
  });
});
