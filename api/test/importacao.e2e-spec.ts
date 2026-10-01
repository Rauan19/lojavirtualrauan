import { INestApplication } from '@nestjs/common';
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
 * Importação de produtos por planilha (CSV do Excel ou do Google Planilhas).
 */
describe('Importar produtos por planilha (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let token: string;
  let codigoExistente: string;

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
    seed = await seedStore(prisma, { stock: 2, price: 50 });
    // loja com frete fixo: não exige medidas
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { freteModo: 'fixo' },
    });
    const p = await prisma.product.update({
      where: { id: seed.product.id },
      data: { sku: 'CAMISA-01' },
    });
    codigoExistente = p.sku as string;
    token = await signAdminToken(app, seed.admin);
  });

  /** CSV como o Excel brasileiro salva: ";" e Windows-1252. */
  const planilha = (linhas: string[]) =>
    Buffer.from(linhas.join('\r\n'), 'latin1');

  const enviar = (arquivo: Buffer, confirmar = false, nome = 'produtos.csv') =>
    request(app.getHttpServer())
      .post(`/api/admin/products/importar${confirmar ? '?confirmar=1' : ''}`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .attach('arquivo', arquivo, nome);

  const csv = () =>
    planilha([
      'Nome;Preço;Estoque;Código;Categoria;Fotos',
      'Calça Jeans;129,90;10;CALCA-01;Calças;https://cdn.teste/calca.jpg',
      `Camisa atualizada;59,90;7;${codigoExistente};;`,
      'Bermuda;0;3;;Calças;',
    ]);

  it('prévia: mostra o que vai acontecer e não grava nada', async () => {
    const antes = await prisma.product.count();
    const res = await enviar(csv()).expect(201);
    expect(res.body.resumo).toEqual({ criar: 1, atualizar: 1, erros: 1 });
    expect(res.body.linhas[2]).toMatchObject({
      linha: 4,
      acao: 'erro',
      erros: ['preço inválido: "0"'],
    });
    expect(await prisma.product.count()).toBe(antes);
  });

  it('confirmar: cria, atualiza pelo código e cria a categoria', async () => {
    const res = await enviar(csv(), true).expect(201);
    expect(res.body.criados).toBe(1);
    expect(res.body.atualizados).toBe(1);
    expect(res.body.erros).toHaveLength(1);

    const calca = await prisma.product.findFirstOrThrow({
      where: { storeId: seed.store.id, sku: 'CALCA-01' },
      include: { images: true, category: true },
    });
    expect(calca.name).toBe('Calça Jeans');
    expect(Number(calca.price)).toBe(129.9);
    expect(calca.stock).toBe(10);
    expect(calca.category?.name).toBe('Calças');
    expect(calca.images.map((i) => i.url)).toEqual([
      'https://cdn.teste/calca.jpg',
    ]);

    const camisa = await prisma.product.findUniqueOrThrow({
      where: { id: seed.product.id },
    });
    expect(camisa.name).toBe('Camisa atualizada');
    expect(Number(camisa.price)).toBe(59.9);
  });

  it('respeita o limite de produtos do plano', async () => {
    await prisma.platformPlan.upsert({
      where: { id: 'plano-mini' },
      create: {
        id: 'plano-mini',
        name: 'Mini',
        amount: 10,
        periodDays: 30,
        maxProducts: 1,
        features: [],
      },
      update: { maxProducts: 1 },
    });
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { planName: 'plano-mini', status: 'ACTIVE' },
    });
    const res = await enviar(csv()).expect(201);
    expect(res.body.limite).toMatchObject({ maximo: 1, vagas: 0, passa: true });
    const conf = await enviar(csv(), true).expect(400);
    expect(conf.body.message).toMatch(/permite 1 produtos/);
  });

  it('recusa arquivo que não é CSV e planilha sem as colunas', async () => {
    await enviar(Buffer.from('x'), false, 'produtos.xlsx').expect(400);
    const res = await enviar(planilha(['produto;estoque', 'A;1'])).expect(400);
    expect(res.body.message).toMatch(/"nome" e "preco"/);
  });

  it('admin de outra loja não mexe na loja do seed', async () => {
    const outra = await seedStore(prisma);
    await prisma.store.update({
      where: { id: outra.store.id },
      data: { freteModo: 'fixo' },
    });
    const tokenOutra = await signAdminToken(app, outra.admin);
    // tenta a loja do seed pelo cabeçalho; o painel usa sempre a loja do token
    await request(app.getHttpServer())
      .post('/api/admin/products/importar?confirmar=1')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${tokenOutra}`)
      .attach('arquivo', planilha(['nome;preco', 'Produto X;10']), 'p.csv')
      .expect(201);
    expect(
      await prisma.product.count({
        where: { storeId: seed.store.id, name: 'Produto X' },
      }),
    ).toBe(0);
    expect(
      await prisma.product.count({
        where: { storeId: outra.store.id, name: 'Produto X' },
      }),
    ).toBe(1);
  });
});
