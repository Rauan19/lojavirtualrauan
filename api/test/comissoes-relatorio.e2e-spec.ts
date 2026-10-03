import { INestApplication } from '@nestjs/common';
import { PlatformFeeEntryType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
 * Fases 4 a 6 do split: relatório do Super Admin (com CSV para a NFS-e),
 * resumo do lojista e liberação loja a loja.
 */
describe('Comissões: relatório, termos e liberação (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let superToken: string;
  let lojistaToken: string;

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
    const superAdmin = await prisma.user.create({
      data: {
        email: 'super@plataforma.local',
        passwordHash: await bcrypt.hash('senha-super-123', 10),
        name: 'Super Admin',
        role: Role.SUPER_ADMIN,
      },
    });
    superToken = await signAdminToken(app, {
      id: superAdmin.id,
      email: superAdmin.email,
      role: Role.SUPER_ADMIN,
      storeId: null,
      tokenVersion: 0,
    });
    seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        name: 'Loja; da "Ana"',
        sellerDocument: '12345678000190',
        sellerLegalName: 'Ana Comércio LTDA',
      },
    });
    lojistaToken = await signAdminToken(app, seed.admin);
  });

  /** Lança no livro direto (o caminho do MP é coberto em comissao-livro). */
  async function lancar(
    type: PlatformFeeEntryType,
    amountCents: number,
    quando: Date,
    chave: string,
  ) {
    await prisma.platformFeeEntry.create({
      data: {
        storeId: seed.store.id,
        type,
        amountCents,
        idempotencyKey: chave,
        createdAt: quando,
      },
    });
  }

  const http = () => request(app.getHttpServer());

  it('relatório soma o mês no horário de Brasília', async () => {
    // 31/10 23h em Brasília = 01/11 02h UTC → ainda é outubro
    await lancar('CHARGE', 180, new Date('2026-11-01T02:00:00Z'), 'c1');
    await lancar('CHARGE', 200, new Date('2026-10-15T12:00:00Z'), 'c2');
    await lancar('REFUND', -50, new Date('2026-10-20T12:00:00Z'), 'r1');
    // novembro de verdade (fora)
    await lancar('CHARGE', 999, new Date('2026-11-01T04:00:00Z'), 'c3');

    const res = await http()
      .get('/api/platform-fee/relatorio?mes=2026-10')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);

    expect(res.body.totais).toEqual({
      cobradoCents: 380,
      devolvidoCents: 50,
      liquidoCents: 330,
      pedidos: 2,
    });
    expect(res.body.lojasComMovimento).toBe(1);
    expect(res.body.mesAnterior.mes).toBe('2026-09');

    const lojas = await http()
      .get('/api/platform-fee/relatorio/lojas?mes=2026-10')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(lojas.body.total).toBe(1);
    expect(lojas.body.itens[0]).toMatchObject({
      storeId: seed.store.id,
      liquidoCents: 330,
      liberacao: 'geral',
    });
  });

  it('lojas paginadas: ordem por valor, busca e filtro no servidor', async () => {
    // 30 lojas: as 3 primeiras com movimento (valores diferentes)
    const lojas = [seed.store.id];
    for (let i = 1; i < 30; i++) {
      const s = await seedStore(prisma);
      await prisma.store.update({
        where: { id: s.store.id },
        data: { name: `Loja ${String(i).padStart(2, '0')}` },
      });
      lojas.push(s.store.id);
    }
    const quando = new Date('2026-10-10T12:00:00Z');
    const valores = [500, 900, 100];
    for (const [i, v] of valores.entries()) {
      await prisma.platformFeeEntry.create({
        data: {
          storeId: lojas[i],
          type: 'CHARGE',
          amountCents: v,
          idempotencyKey: `p${i}`,
          createdAt: quando,
        },
      });
    }
    const get = (q: string) =>
      http()
        .get(`/api/platform-fee/relatorio/lojas?mes=2026-10&${q}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

    // só com movimento, maior valor primeiro
    let r = await get('');
    expect(r.body.total).toBe(3);
    expect(
      r.body.itens.map((l: { liquidoCents: number }) => l.liquidoCents),
    ).toEqual([900, 500, 100]);

    // todas: 30 lojas em páginas de 25; as com movimento abrem a lista
    r = await get('filtro=todas&porPagina=25');
    expect(r.body).toMatchObject({ total: 30, totalPaginas: 2, pagina: 1 });
    expect(r.body.itens).toHaveLength(25);
    expect(r.body.itens[0].liquidoCents).toBe(900);
    r = await get('filtro=todas&porPagina=25&pagina=2');
    expect(r.body.itens).toHaveLength(5);
    // nenhuma loja repetida entre as páginas
    const p1 = await get('filtro=todas&porPagina=25');
    const ids = [...p1.body.itens, ...r.body.itens].map(
      (l: { storeId: string }) => l.storeId,
    );
    expect(new Set(ids).size).toBe(30);

    // busca pelo nome, sem diferenciar maiúscula
    r = await get('filtro=todas&busca=loja%2007');
    expect(r.body.total).toBe(1);
    expect(r.body.itens[0].nome).toBe('Loja 07');

    // ordem por nome e parâmetro inválido
    r = await get('filtro=todas&ordem=nome&porPagina=3');
    expect(r.body.itens.map((l: { nome: string }) => l.nome)).toEqual([
      'Loja 01',
      'Loja 02',
      'Loja 03',
    ]);
    await http()
      .get('/api/platform-fee/relatorio/lojas?porPagina=500')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(400);
  });

  it('CSV para a nota fiscal: ; como separador, vírgula decimal, texto escapado', async () => {
    await lancar('CHARGE', 123456, new Date('2026-10-15T12:00:00Z'), 'c1');
    const res = await http()
      .get('/api/platform-fee/relatorio.csv?mes=2026-10')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      'comissoes-2026-10.csv',
    );
    const linhas = res.text.replace(/^\uFEFF/, '').split('\r\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain('"Loja; da ""Ana"""');
    expect(linhas[1]).toContain('12345678000190');
    expect(linhas[1]).toMatch(/;1234,56;0,00;1234,56$/);
  });

  it('só o Super Admin vê o relatório e libera loja', async () => {
    await http()
      .get('/api/platform-fee/relatorio')
      .set('Authorization', `Bearer ${lojistaToken}`)
      .expect(403);
    await http()
      .patch(`/api/platform-fee/lojas/${seed.store.id}`)
      .set('Authorization', `Bearer ${lojistaToken}`)
      .send({ platformFeeEnabled: false })
      .expect(403);
  });

  it('liberação loja a loja: ligada, desligada e de volta ao geral', async () => {
    for (const valor of [true, false, null]) {
      await http()
        .patch(`/api/platform-fee/lojas/${seed.store.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ platformFeeEnabled: valor })
        .expect(200);
      const loja = await prisma.store.findUniqueOrThrow({
        where: { id: seed.store.id },
      });
      expect(loja.platformFeeEnabled).toBe(valor);
    }
    await http()
      .patch(`/api/platform-fee/lojas/${seed.store.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ platformFeeEnabled: 'sim' })
      .expect(400);
  });

  it('lojista vê só o próprio resumo do mês', async () => {
    const outra = await seedStore(prisma);
    await lancar('CHARGE', 300, new Date(), 'c-minha');
    await prisma.platformFeeEntry.create({
      data: {
        storeId: outra.store.id,
        type: 'CHARGE',
        amountCents: 7777,
        idempotencyKey: 'c-outra',
      },
    });
    const res = await http()
      .get('/api/platform-fee/me')
      .set('Authorization', `Bearer ${lojistaToken}`)
      .set('x-store-slug', seed.store.slug)
      .expect(200);
    expect(res.body.totais.cobradoCents).toBe(300);
    expect(res.body).toHaveProperty('conectado', false);
  });

  it('divergência conferida sai da lista', async () => {
    const order = await prisma.order.create({
      data: {
        storeId: seed.store.id,
        orderNumber: '900001',
        customerName: 'Cliente',
        customerEmail: 'c@teste.local',
        subtotal: 90,
        total: 100,
        platformFeeCents: 180,
        platformFeeChargedCents: 100,
        platformFeeMismatch: true,
      },
    });
    let res = await http()
      .get('/api/platform-fee/divergencias')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens).toHaveLength(1);

    await http()
      .post(`/api/platform-fee/divergencias/${order.id}/resolver`)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(201);
    res = await http()
      .get('/api/platform-fee/divergencias')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(res.body.total).toBe(0);
    const resumo = await http()
      .get('/api/platform-fee/relatorio')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(resumo.body.divergenciasTotal).toBe(0);
  });
});
