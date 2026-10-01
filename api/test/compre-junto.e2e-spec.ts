import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * "Compre junto": o lojista escolhe até 3 produtos para sugerir com outro;
 * a vitrine só mostra o que dá para comprar agora.
 */
describe('Compre junto (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let token = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedStore(prisma);
    token = await signAdminToken(app, seed.admin);
  });

  const produto = (
    nome: string,
    extra: Partial<Prisma.ProductCreateInput> = {},
  ) =>
    prisma.product.create({
      data: {
        store: { connect: { id: seed.store.id } },
        name: nome,
        slug: nome.toLowerCase().replace(/\s+/g, '-'),
        price: new Prisma.Decimal(30),
        stock: 5,
        ...extra,
      },
    });

  const definir = (ids: string[], id = seed.product.id) =>
    request(app.getHttpServer())
      .put(`/api/admin/products/${id}/compre-junto`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids });

  const vitrine = () =>
    request(app.getHttpServer())
      .get(`/api/catalog/products/${seed.product.id}/compre-junto`)
      .set('x-store-slug', seed.store.slug)
      .expect(200)
      .then((r) => r.body.items as { id: string; name: string }[]);

  it('guarda na ordem escolhida e mostra na vitrine', async () => {
    const capa = await produto('Capa');
    const cinto = await produto('Cinto');
    const res = await definir([cinto.id, capa.id, cinto.id]).expect(200);
    expect(res.body.ids).toEqual([cinto.id, capa.id]);
    expect((await vitrine()).map((i) => i.name)).toEqual(['Cinto', 'Capa']);
  });

  it('vitrine esconde esgotado, inativo e apagado', async () => {
    const esgotado = await produto('Esgotado', { stock: 0 });
    const inativo = await produto('Inativo', { active: false });
    const apagado = await produto('Apagado');
    const ok = await produto('Ok');
    await definir([esgotado.id, inativo.id, apagado.id]).expect(200);
    await prisma.product.update({
      where: { id: seed.product.id },
      data: { buyTogetherIds: [esgotado.id, inativo.id, apagado.id, ok.id] },
    });
    await prisma.product.delete({ where: { id: apagado.id } });
    expect((await vitrine()).map((i) => i.name)).toEqual(['Ok']);
  });

  it('recusa o próprio produto, mais de 3 e produto de outra loja', async () => {
    await definir([seed.product.id]).expect(400);
    const p = await Promise.all(
      ['A', 'B', 'C', 'D'].map((n) => produto(`Item ${n}`)),
    );
    const muitos = await definir(p.map((x) => x.id)).expect(400);
    expect(muitos.body.message).toMatch(/até 3/);

    const outra = await seedStore(prisma);
    await definir([outra.product.id]).expect(400);
    // produto de outra loja também não é editável por aqui
    await definir([], outra.product.id).expect(404);
  });
});
