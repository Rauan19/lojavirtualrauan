import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  type SeededStore,
} from './helpers/test-app';

/* Busca da vitrine e do painel: cliente digita sem acento e acha mesmo assim. */
describe('Busca sem acento (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;

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
    for (const [name, brand] of [
      ['Tênis Runner Street', 'Corrida'],
      ['Café Especial', 'Grão Ação'],
      ['Desconto 50% off', null],
    ] as const) {
      await prisma.product.create({
        data: {
          storeId: seed.store.id,
          name,
          brand,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          price: new Prisma.Decimal(10),
          stock: 3,
        },
      });
    }
  });

  const buscar = (q: string) =>
    request(app.getHttpServer())
      .get(`/api/catalog/products?q=${encodeURIComponent(q)}`)
      .set('x-store-slug', seed.store.slug)
      .expect(200)
      .then((r) => (r.body.items as { name: string }[]).map((p) => p.name));

  it('acha com e sem acento, maiúscula ou não', async () => {
    expect(await buscar('tenis')).toEqual(['Tênis Runner Street']);
    expect(await buscar('TÊNIS')).toEqual(['Tênis Runner Street']);
    expect(await buscar('cafe')).toEqual(['Café Especial']);
    // pela marca também
    expect(await buscar('grao acao')).toEqual(['Café Especial']);
  });

  it('% e _ são texto, não curinga', async () => {
    expect(await buscar('50%')).toEqual(['Desconto 50% off']);
    expect(await buscar('%')).toEqual(['Desconto 50% off']);
    expect(await buscar('_')).toEqual([]);
  });

  it('não mistura produtos de outra loja', async () => {
    const outra = await seedStore(prisma);
    await prisma.product.create({
      data: {
        storeId: outra.store.id,
        name: 'Tênis da outra loja',
        slug: 'tenis-outra',
        price: new Prisma.Decimal(10),
        stock: 3,
      },
    });
    expect(await buscar('tenis')).toEqual(['Tênis Runner Street']);
  });
});
