import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AviseMeService } from '../src/avise-me/avise-me.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * "Avise-me quando chegar": e-mail num produto esgotado, um aviso só quando
 * o estoque volta.
 */
describe('Avise-me quando chegar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let enviados: { to: string; subject: string }[] = [];
  let ip = 0;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    jest.spyOn(app.get(MailService), 'send').mockImplementation(async (i) => {
      const e = i as { to: string; subject: string };
      if (/^Chegou!/.test(e.subject)) enviados.push(e);
      return { sent: true };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    enviados = [];
    seed = await seedStore(prisma, { stock: 0 });
  });

  const pedir = (body: Record<string, unknown>, slug = seed.store.slug) =>
    request(app.getHttpServer())
      .post('/api/storefront/avise-me')
      .set('x-store-slug', slug)
      // cada pedido de um IP: o limite por IP (5/min) é de propósito
      .set('X-Forwarded-For', `203.0.113.${++ip}`)
      .send(body);

  const varrer = () => app.get(AviseMeService).varrer();

  it('guarda o pedido e avisa uma vez só quando o estoque volta', async () => {
    await pedir({ productId: seed.product.id, email: 'Ana@Teste.com' }).expect(
      201,
    );
    // pedir de novo não duplica
    await pedir({ productId: seed.product.id, email: 'ana@teste.com' }).expect(
      201,
    );
    expect(await prisma.stockAlert.count()).toBe(1);

    // ainda esgotado: nada
    expect(await varrer()).toBe(0);

    await prisma.product.update({
      where: { id: seed.product.id },
      data: { stock: 3 },
    });
    expect(await varrer()).toBe(1);
    expect(await varrer()).toBe(0);
    expect(enviados).toEqual([
      expect.objectContaining({ to: 'ana@teste.com' }),
    ]);
  });

  it('produto com estoque não aceita pedido de aviso', async () => {
    await prisma.product.update({
      where: { id: seed.product.id },
      data: { stock: 2 },
    });
    const res = await pedir({
      productId: seed.product.id,
      email: 'ana@teste.com',
    }).expect(400);
    expect(res.body.message).toMatch(/é só comprar/);
  });

  it('e-mail inválido e produto de outra loja são recusados', async () => {
    await pedir({ productId: seed.product.id, email: 'nao-e-email' }).expect(
      400,
    );
    const outra = await seedStore(prisma, { stock: 0 });
    await pedir(
      { productId: seed.product.id, email: 'ana@teste.com' },
      outra.store.slug,
    ).expect(404);
  });

  it('painel mostra quantos esperam cada produto', async () => {
    await pedir({ productId: seed.product.id, email: 'a@teste.com' }).expect(
      201,
    );
    await pedir({ productId: seed.product.id, email: 'b@teste.com' }).expect(
      201,
    );
    const token = await signAdminToken(app, seed.admin);
    const res = await request(app.getHttpServer())
      .get('/api/admin/avise-me')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalEsperando).toBe(2);
    expect(res.body.produtos[0]).toMatchObject({
      productId: seed.product.id,
      esperando: 2,
      estoque: 0,
    });
  });
});
