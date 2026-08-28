import { INestApplication } from '@nestjs/common';
import { Role, SellerDocType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ADDRESS,
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
} from './helpers/test-app';

const VALID_CPF = '11144477735';
const VALID_CNPJ = '11222333000181';

/**
 * Criação manual de loja pelo Super Admin — mesma exigência de dados
 * completos (documento validado, telefone, endereço) que o signup público.
 */
describe('Super Admin cria loja manualmente (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superToken: string;

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
  });

  const createStore = (body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Loja Criada Manual',
        adminName: 'Dono Manual',
        adminEmail: 'manual@exemplo.com',
        adminPassword: 'senha123',
        sellerDocType: SellerDocType.CPF,
        sellerDocument: VALID_CPF,
        sellerPhone: '11988887777',
        sellerZipCode: ADDRESS.zipCode,
        sellerStreet: ADDRESS.street,
        sellerNumber: ADDRESS.number,
        sellerNeighborhood: ADDRESS.neighborhood,
        sellerCity: ADDRESS.city,
        sellerState: ADDRESS.state,
        ...body,
      });

  it('cria a loja quando os dados estão completos', async () => {
    const res = await createStore().expect(201);
    expect(res.body.slug).toBeTruthy();
  });

  it('recusa sem documento (CPF/CNPJ)', async () => {
    await createStore({ sellerDocType: undefined, sellerDocument: undefined }).expect(
      400,
    );
  });

  it('recusa CPF com dígito verificador inválido', async () => {
    await createStore({ sellerDocument: '11144477736' }).expect(400);
  });

  it('aceita CNPJ válido', async () => {
    const res = await createStore({
      sellerDocType: SellerDocType.CNPJ,
      sellerDocument: VALID_CNPJ,
      adminEmail: 'manual-cnpj@exemplo.com',
    }).expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.sellerDocType).toBe(SellerDocType.CNPJ);
  });

  it('recusa sem telefone', async () => {
    await createStore({ sellerPhone: undefined }).expect(400);
  });

  it('recusa telefone com DDD inexistente', async () => {
    await createStore({ sellerPhone: '00988887777' }).expect(400);
  });

  it('recusa sem endereço (falta rua)', async () => {
    await createStore({ sellerStreet: undefined }).expect(400);
  });

  it('recusa CEP incompleto', async () => {
    await createStore({ sellerZipCode: '123' }).expect(400);
  });

  it('grava o mesmo endereço como origem do frete', async () => {
    const res = await createStore().expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.freteCepOrigem).toBe(store.sellerZipCode);
    expect(store.freteEmailContato).toBe('manual@exemplo.com');
  });

  it('só Super Admin cria loja manualmente', async () => {
    const seed = await seedStore(prisma);
    const token = await signAdminToken(app, seed.admin);

    await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tentativa',
        adminName: 'X',
        adminEmail: 'tentativa@exemplo.com',
        adminPassword: 'senha123',
      })
      .expect(403);
  });

  it('Super Admin ainda escolhe status/plano/vencimento diretamente (diferente do signup público)', async () => {
    const res = await createStore({
      status: 'ACTIVE',
      monthlyFee: 250,
    }).expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.status).toBe('ACTIVE');
    expect(Number(store.monthlyFee)).toBe(250);
  });
});
