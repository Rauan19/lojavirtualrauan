import { INestApplication } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
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
 * Catálogo para Google Shopping e Instagram: um XML público por loja, com o
 * que já está na vitrine.
 */
describe('Catálogo Google/Meta (e2e)', () => {
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
    seed = await seedStore(prisma, { stock: 4, price: 59.9 });
    await prisma.productImage.create({
      data: { productId: seed.product.id, url: 'https://cdn.teste/foto.webp' },
    });
  });

  const feed = (slug: string) =>
    request(app.getHttpServer()).get(`/api/public/catalogo/${slug}.xml`);

  it('XML com o produto ativo, preço e estoque', async () => {
    const res = await feed(seed.store.slug).expect(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain(
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    );
    expect(res.text).toContain(`<g:title>${seed.product.name}</g:title>`);
    expect(res.text).toContain('<g:price>59.90 BRL</g:price>');
    expect(res.text).toContain('<g:availability>in_stock</g:availability>');
    expect(res.text).toContain(`/loja/${seed.store.slug}/p/`);
  });

  it('produto desativado não entra', async () => {
    await prisma.product.update({
      where: { id: seed.product.id },
      data: { active: false },
    });
    const res = await feed(seed.store.slug).expect(200);
    expect(res.text).not.toContain('<item>');
  });

  it('loja suspensa ou endereço estranho: 404', async () => {
    await feed('nao-existe').expect(404);
    await request(app.getHttpServer())
      .get(`/api/public/catalogo/${seed.store.slug}.json`)
      .expect(404);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { status: StoreStatus.SUSPENDED },
    });
    await feed(seed.store.slug).expect(404);
  });

  it('painel mostra o endereço e quantos produtos entraram', async () => {
    const token = await signAdminToken(app, seed.admin);
    const res = await request(app.getHttpServer())
      .get('/api/admin/catalogo')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({
      url: expect.stringContaining(
        `/api/public/catalogo/${seed.store.slug}.xml`,
      ),
      produtosNoCatalogo: 1,
      produtosSemFoto: 0,
    });
  });
});
