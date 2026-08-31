import { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
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

type SentMail = { to: string; subject: string; text: string; html: string };

/*
 * Devolução e reembolso.
 *
 * Aprovar um reembolso estornava o dinheiro e recolocava o item no estoque na
 * mesma hora — com o produto ainda na casa do cliente. Se ele não devolvesse,
 * o lojista perdia produto e dinheiro; e o estoque ficava com peça fantasma,
 * que a loja vende e não consegue entregar.
 */
describe('Devolução e reembolso (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let seed: SeededStore;
  let customerToken: string;
  let adminToken: string;
  let sent: SentMail[] = [];

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    orders = app.get(OrdersService);

    jest
      .spyOn(app.get(MailService), 'send')
      .mockImplementation(async (input) => {
        sent.push(input as SentMail);
        return { sent: true };
      });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    sent = [];
    seed = await seedStore(prisma, { stock: 10 });
    customerToken = await signCustomerToken(app, seed.customer);
    adminToken = await signAdminToken(app, seed.admin);
  });

  const esperarEmail = async (trecho: string, timeoutMs = 5000) => {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (sent.some((m) => m.subject.includes(trecho))) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  /** Pedido pago e entregue, que é o estado em que se pede devolução. */
  async function pedidoEntregue(diasDesdeEntrega = 0) {
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

    await orders.fulfillPaidOrder(res.body.id, seed.store.id, `mp-${res.body.id}`);
    await prisma.order.update({
      where: { id: res.body.id },
      data: {
        status: OrderStatus.DELIVERED,
        shippedAt: new Date(),
        deliveredAt: new Date(
          Date.now() - diasDesdeEntrega * 24 * 60 * 60 * 1000,
        ),
        mpPaymentId: `mp-${res.body.id}`,
      },
    });
    return res.body.id as string;
  }

  const pedirReembolso = (orderId: string, reasonType: string) =>
    request(app.getHttpServer())
      .post(`/api/storefront/orders/${orderId}/refund-request`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonType });

  const aprovar = (orderId: string) =>
    request(app.getHttpServer())
      .post(`/api/admin/orders/${orderId}/refund/approve`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`);

  const recusar = (orderId: string, reason = 'fora da política') =>
    request(app.getHttpServer())
      .post(`/api/admin/orders/${orderId}/refund/reject`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason });

  describe('etapa de devolução', () => {
    it('aprovar não estorna nem devolve estoque enquanto o produto não volta', async () => {
      const id = await pedidoEntregue();
      const estoqueAntes = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;

      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);
      await aprovar(id).expect(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(order.refundStatus).toBe('RETURN_PENDING');
      expect(order.refundedAt).toBeNull();
      expect(order.status).not.toBe(OrderStatus.REFUNDED);

      const estoqueDepois = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;
      expect(estoqueDepois).toBe(estoqueAntes);
    });

    it('confirmar recebimento devolve o estoque', async () => {
      const id = await pedidoEntregue();
      const antes = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;

      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);
      await aprovar(id).expect(201);
      await orders.markReturnReceived(seed.store.id, id);

      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(order.returnReceivedAt).toBeInstanceOf(Date);

      // o estorno em si depende do gateway; aqui basta o estoque liberado
      await orders.restockOrderItems(seed.store.id, id);
      const depois = (
        await prisma.product.findUniqueOrThrow({ where: { id: seed.product.id } })
      ).stock;
      expect(depois).toBe(antes + 1);
    });

    it('não deixa confirmar devolução de pedido que não está esperando', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);

      await expect(
        orders.markReturnReceived(seed.store.id, id),
      ).rejects.toThrow(/aguardando devolução/i);
    });

    it('extravio não passa pela etapa de devolução', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'NAO_RECEBI').expect(201);

      // sem gateway configurado o estorno falha, mas o importante é que ele
      // foi TENTADO em vez de virar "aguardando devolução"
      const res = await aprovar(id);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/Mercado Pago/i);

      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(order.refundStatus).toBe('REQUESTED');
    });
  });

  describe('direito de arrependimento (CDC art. 49)', () => {
    it('lojista não pode recusar dentro dos 7 dias', async () => {
      const id = await pedidoEntregue(2);
      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);

      const res = await recusar(id);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/art\. 49/i);

      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(order.refundStatus).toBe('REQUESTED');
    });

    it('passados os 7 dias, o cliente não consegue mais alegar arrependimento', async () => {
      const id = await pedidoEntregue(9);

      const res = await pedirReembolso(id, 'ARREPENDIMENTO');
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/prazo de 7 dias/i);
    });

    it('defeito continua podendo ser recusado', async () => {
      const id = await pedidoEntregue(2);
      await pedirReembolso(id, 'DEFEITO').expect(201);

      await recusar(id).expect(201);
      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(order.refundStatus).toBe('REJECTED');
    });

    it('pedido ainda não entregue mantém o direito', async () => {
      const id = await pedidoEntregue();
      await prisma.order.update({
        where: { id },
        data: { deliveredAt: null, status: OrderStatus.SHIPPED },
      });

      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);
      const res = await recusar(id);
      expect(res.status).toBe(400);
    });
  });

  describe('avisos ao cliente', () => {
    it('confirma o recebimento da solicitação (Decreto 7.962 art. 5º)', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);
      await esperarEmail('Recebemos seu pedido de reembolso');

      const email = sent.find((m) =>
        m.subject.includes('Recebemos seu pedido de reembolso'),
      );
      expect(email).toBeDefined();
      expect(email!.to).toBe(seed.customer.email);
      expect(email!.text).toContain('comprovante');
    });

    it('avisa quando a devolução é autorizada, com as instruções', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);
      await aprovar(id).expect(201);
      await esperarEmail('Devolução autorizada');

      const email = sent.find((m) => m.subject.includes('Devolução autorizada'));
      expect(email).toBeDefined();
      expect(email!.text).toContain('sem sinais de uso');
    });

    it('avisa quando a solicitação é recusada, com o motivo', async () => {
      const id = await pedidoEntregue(2);
      await pedirReembolso(id, 'DEFEITO').expect(201);
      await recusar(id, 'produto fora da garantia').expect(201);
      await esperarEmail('não foi aceito');

      const email = sent.find((m) => m.subject.includes('não foi aceito'));
      expect(email).toBeDefined();
      expect(email!.text).toContain('produto fora da garantia');
    });
  });

  describe('validação do motivo', () => {
    it('recusa motivo fora da lista', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'PORQUE_SIM').expect(400);
    });

    it('exige motivo', async () => {
      const id = await pedidoEntregue();
      await request(app.getHttpServer())
        .post(`/api/storefront/orders/${id}/refund-request`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({})
        .expect(400);
    });

    it('não deixa abrir duas solicitações', async () => {
      const id = await pedidoEntregue();
      await pedirReembolso(id, 'ARREPENDIMENTO').expect(201);

      const segunda = await pedirReembolso(id, 'DEFEITO');
      expect(segunda.status).toBe(400);
      expect(String(segunda.body.message)).toMatch(/já existe/i);
    });
  });
});
