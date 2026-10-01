import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import * as webpush from 'web-push';
import { AvisosService } from '../src/avisos/avisos.service';
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
 * "Você vendeu!" no celular: cada pessoa liga os avisos no próprio aparelho
 * e o pagamento aprovado avisa o dono e quem cuida de pedidos, uma vez só.
 */
describe('Avisos no celular (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let enviados: { endpoint: string; corpo: string }[] = [];
  let respostaDoPush: () => Promise<unknown> = async () => ({});
  let n = 0;

  beforeAll(async () => {
    const chaves = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = chaves.publicKey;
    process.env.VAPID_PRIVATE_KEY = chaves.privateKey;
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    jest
      .spyOn(app.get(AvisosService), 'entregar')
      .mockImplementation(async (sub, corpo) => {
        enviados.push({ endpoint: sub.endpoint, corpo: String(corpo) });
        return (await respostaDoPush()) as webpush.SendResult;
      });
  });

  afterAll(async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    enviados = [];
    respostaDoPush = async () => ({});
    seed = await seedStore(prisma);
  });

  /** Inscreve um aparelho; resolve com o status HTTP. */
  const inscrever = async (
    user: {
      id: string;
      email: string;
      role: Role;
      storeId: string | null;
      tokenVersion: number;
    },
    endpoint = `https://fcm.googleapis.com/fcm/send/aparelho-${++n}`,
  ) => {
    const token = await signAdminToken(app, user);
    const res = await request(app.getHttpServer())
      .post('/api/admin/avisos/inscrever')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', `192.0.2.${++n % 250}`)
      .send({
        endpoint,
        keys: { p256dh: 'BPx-chave-publica', auth: 'segredo-auth' },
        device: 'Chrome no Android',
      });
    return res.status;
  };

  async function pedidoPago() {
    const token = await signCustomerToken(app, seed.customer);
    const res = await request(app.getHttpServer())
      .post('/api/checkout/orders')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: seed.product.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        shippingMethod: 'Entrega padrão',
        acceptTerms: true,
        shippingOptionId: 'padrao',
      })
      .expect(201);
    const orders = app.get(OrdersService);
    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-1');
    // webhook repetido não avisa de novo
    await orders.fulfillPaidOrder(res.body.id, seed.store.id, 'mp-1');
    // o aviso sai sem await (não segura a venda)
    await new Promise((r) => setTimeout(r, 300));
    return res.body.id as string;
  }

  const funcionario = (permissions: string[], email: string) =>
    prisma.user.create({
      data: {
        email,
        name: 'Equipe',
        passwordHash: 'x',
        role: 'STORE_ADMIN',
        storeId: seed.store.id,
        storeOwner: false,
        permissions,
      },
    });

  it('venda aprovada avisa o dono e quem cuida de pedidos, uma vez', async () => {
    const pedidos = await funcionario(['pedidos'], 'pedidos@teste.com');
    const produtos = await funcionario(['produtos'], 'produtos@teste.com');
    expect(
      await inscrever(seed.admin, 'https://fcm.googleapis.com/fcm/send/dono'),
    ).toBe(201);
    expect(
      await inscrever(pedidos, 'https://fcm.googleapis.com/fcm/send/pedidos'),
    ).toBe(201);
    expect(
      await inscrever(produtos, 'https://fcm.googleapis.com/fcm/send/produtos'),
    ).toBe(201);

    const id = await pedidoPago();
    expect(enviados.map((e) => e.endpoint).sort()).toEqual([
      'https://fcm.googleapis.com/fcm/send/dono',
      'https://fcm.googleapis.com/fcm/send/pedidos',
    ]);
    const aviso = JSON.parse(enviados[0].corpo);
    expect(aviso.title).toMatch(/^Você vendeu! R\$/);
    expect(aviso.url).toBe(`/admin/orders?pedido=${id}`);
  });

  it('aparelho que desinscreveu (410) sai da lista', async () => {
    expect(await inscrever(seed.admin)).toBe(201);
    respostaDoPush = async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    };
    await pedidoPago();
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('só aceita serviço de push conhecido (nada de endereço interno)', async () => {
    for (const endpoint of [
      'http://localhost:5432/x',
      'https://169.254.169.254/latest',
      'https://fcm.googleapis.com.evil.com/x',
    ]) {
      expect(await inscrever(seed.admin, endpoint)).toBe(400);
    }
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('funcionário de qualquer área liga os avisos no próprio aparelho', async () => {
    const produtos = await funcionario(['produtos'], 'produtos@teste.com');
    expect(await inscrever(produtos)).toBe(201);
    const painel = await request(app.getHttpServer())
      .get('/api/admin/avisos')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${await signAdminToken(app, produtos)}`)
      .expect(200);
    expect(painel.body.disponivel).toBe(true);
    expect(painel.body.aparelhos).toHaveLength(1);
  });
});
