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
    const loja = res.body.lojas.find(
      (l: { storeId: string }) => l.storeId === seed.store.id,
    );
    expect(loja).toMatchObject({ liquidoCents: 330, liberacao: 'geral' });
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
    const linhas = res.text.replace(/^﻿/, '').split('\r\n');
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
      .get('/api/platform-fee/relatorio')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(res.body.divergencias).toHaveLength(1);

    await http()
      .post(`/api/platform-fee/divergencias/${order.id}/resolver`)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(201);
    res = await http()
      .get('/api/platform-fee/relatorio')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(res.body.divergencias).toHaveLength(0);
  });
});
