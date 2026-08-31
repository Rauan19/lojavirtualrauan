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
 * Árvore de categorias (departamento > subcategoria).
 *
 * Filtrar por um departamento tem que trazer também o que está nas
 * subcategorias. Antes o filtro era igualdade exata: a árvore aparecia no
 * menu, o cliente clicava no departamento e via prateleira vazia.
 */
describe('Categorias em árvore (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let adminToken: string;

  let masculinos: string;
  let importados: string;
  let nacionais: string;
  let femininos: string;

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
    adminToken = await signAdminToken(app, seed.admin);

    const cat = async (name: string, slug: string, parentId?: string) =>
      (
        await prisma.category.create({
          data: { storeId: seed.store.id, name, slug, parentId },
        })
      ).id;

    masculinos = await cat('Masculinos', 'masculinos');
    importados = await cat('Importados', 'masculinos-importados', masculinos);
    nacionais = await cat('Nacionais', 'masculinos-nacionais', masculinos);
    femininos = await cat('Femininos', 'femininos');

    const produto = (name: string, slug: string, categoryId: string) =>
      prisma.product.create({
        data: {
          storeId: seed.store.id,
          categoryId,
          name,
          slug,
          price: new Prisma.Decimal(100),
          stock: 5,
          active: true,
        },
      });

    await produto('Importado A', 'importado-a', importados);
    await produto('Importado B', 'importado-b', importados);
    await produto('Nacional A', 'nacional-a', nacionais);
    await produto('Feminino A', 'feminino-a', femininos);
  });

  const vitrine = (query: string) =>
    request(app.getHttpServer())
      .get(`/api/catalog/products?${query}`)
      .set('x-store-slug', seed.store.slug);

  it('departamento traz os produtos das subcategorias', async () => {
    const res = await vitrine(`categoryId=${masculinos}&limit=50`).expect(200);

    const nomes = res.body.items.map((p: { name: string }) => p.name).sort();
    expect(nomes).toEqual(['Importado A', 'Importado B', 'Nacional A']);
  });

  it('subcategoria traz só o que é dela', async () => {
    const res = await vitrine(`categoryId=${nacionais}&limit=50`).expect(200);

    const nomes = res.body.items.map((p: { name: string }) => p.name);
    expect(nomes).toEqual(['Nacional A']);
  });

  it('departamento não vaza produto de outro departamento', async () => {
    const res = await vitrine(`categoryId=${masculinos}&limit=50`).expect(200);

    const nomes = res.body.items.map((p: { name: string }) => p.name);
    expect(nomes).not.toContain('Feminino A');
  });

  it('produto na própria pasta do departamento também aparece', async () => {
    await prisma.product.create({
      data: {
        storeId: seed.store.id,
        categoryId: masculinos,
        name: 'Solto no departamento',
        slug: 'solto-no-departamento',
        price: new Prisma.Decimal(50),
        stock: 3,
        active: true,
      },
    });

    const res = await vitrine(`categoryId=${masculinos}&limit=50`).expect(200);
    const nomes = res.body.items.map((p: { name: string }) => p.name);
    expect(nomes).toContain('Solto no departamento');
    expect(nomes).toHaveLength(4);
  });

  it('vale também para a listagem do admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/products?categoryId=${masculinos}&limit=50`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.items).toHaveLength(3);
  });

  describe('cor do anel na vitrine', () => {
    it('vitrine recebe a cor quando definida', async () => {
      await prisma.category.update({
        where: { id: masculinos },
        data: { borderColor: '#c9a75f' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/catalog/categories')
        .set('x-store-slug', seed.store.slug)
        .expect(200);

      const cat = res.body.find((c: { slug: string }) => c.slug === 'masculinos');
      expect(cat.borderColor).toBe('#c9a75f');
    });

    it('sem cor definida vem nulo, e a vitrine usa a da loja', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog/categories')
        .set('x-store-slug', seed.store.slug)
        .expect(200);

      const cat = res.body.find((c: { slug: string }) => c.slug === 'femininos');
      expect(cat.borderColor).toBeNull();
    });

    it('string vazia limpa a cor e volta para a da loja', async () => {
      await prisma.category.update({
        where: { id: masculinos },
        data: { borderColor: '#c9a75f' },
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/categories/${masculinos}`)
        .set('x-store-slug', seed.store.slug)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ borderColor: '' })
        .expect(200);

      const cat = await prisma.category.findUniqueOrThrow({
        where: { id: masculinos },
      });
      expect(cat.borderColor).toBeNull();
    });
  });

  it('categoria inativa não aparece na vitrine', async () => {
    await prisma.category.update({
      where: { id: femininos },
      data: { active: false },
    });

    const res = await request(app.getHttpServer())
      .get('/api/catalog/categories')
      .set('x-store-slug', seed.store.slug)
      .expect(200);

    const slugs = res.body.map((c: { slug: string }) => c.slug);
    expect(slugs).not.toContain('femininos');
    expect(slugs).toContain('masculinos');
  });
});
