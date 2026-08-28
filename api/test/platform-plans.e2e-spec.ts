import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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

/**
 * Planos e duração do trial editáveis pelo Super Admin — antes fixos em
 * código/env, trocar preço exigia deploy.
 */
describe('Planos da plataforma (e2e)', () => {
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

  describe('acesso', () => {
    it('lojista comum não gerencia planos', async () => {
      const seed = await seedStore(prisma);
      const token = await signAdminToken(app, seed.admin);

      await request(app.getHttpServer())
        .get('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('sem token nenhum, 401', async () => {
      await request(app.getHttpServer())
        .get('/api/billing/platform/plans')
        .expect(401);
    });
  });

  describe('CRUD de planos', () => {
    it('lista os planos semeados pela migration', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body.map((p: { name: string }) => p.name)).toContain('Mensal');
    });

    it('cria um plano novo', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: 'Black Friday',
          amount: 99.9,
          periodDays: 30,
          features: ['Tudo incluso'],
        })
        .expect(201);

      expect(res.body.name).toBe('Black Friday');
      expect(res.body.amount).toBe(99.9);

      const row = await prisma.platformPlan.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(Number(row.amount)).toBe(99.9);
    });

    it('edita nome e preço de um plano existente', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Temporário', amount: 50 })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/api/billing/platform/plans/${created.body.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Definitivo', amount: 149.9 })
        .expect(200);

      expect(updated.body.name).toBe('Definitivo');
      expect(updated.body.amount).toBe(149.9);
    });

    it('desativa um plano sem apagar (some da lista pública)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Descontinuado', amount: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/billing/platform/plans/${created.body.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ active: false })
        .expect(200);

      const publicPlans = await request(app.getHttpServer())
        .get('/api/public/plans')
        .expect(200);
      expect(
        publicPlans.body.find((p: { id: string }) => p.id === created.body.id),
      ).toBeUndefined();

      // mas continua existindo pra tela de gestão
      const all = await request(app.getHttpServer())
        .get('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
      expect(
        all.body.find((p: { id: string }) => p.id === created.body.id),
      ).toBeDefined();
    });

    it('remove um plano', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Vai sumir', amount: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/billing/platform/plans/${created.body.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const row = await prisma.platformPlan.findUnique({
        where: { id: created.body.id },
      });
      expect(row).toBeNull();
    });

    it('apagar plano não quebra loja que já usa o nome dele', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Plano Efêmero', amount: 42 })
        .expect(201);

      const signup = await request(app.getHttpServer())
        .post('/api/stores/signup')
        .send({
          storeName: 'Loja Efêmera',
          adminName: 'Dono Efêmero',
          adminEmail: 'efemero@exemplo.com',
          adminPassword: 'senha123',
          planId: created.body.id,
          sellerDocType: 'CPF',
          sellerDocument: VALID_CPF,
          phone: '11988887777',
          ...ADDRESS,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/billing/platform/plans/${created.body.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: signup.body.slug },
      });
      expect(store.planName).toBe('Plano Efêmero');
    });

    it('recusa nome vazio', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: '', amount: 10 })
        .expect(400);
    });

    it('recusa plano inexistente na edição', async () => {
      await request(app.getHttpServer())
        .patch('/api/billing/platform/plans/nao-existe')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Novo Nome' })
        .expect(404);
    });
  });

  describe('trial configurável', () => {
    it('valor padrão vem do .env quando ninguém configurou nada', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/platform/general')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
      expect(res.body.trialDays).toBe(14); // TRIAL_DAYS no env de teste
    });

    it('super admin muda a duração do trial', async () => {
      await request(app.getHttpServer())
        .patch('/api/billing/platform/general')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ trialDays: 7 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/billing/platform/general')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
      expect(res.body.trialDays).toBe(7);
    });

    it('signup novo passa a usar o trial atualizado', async () => {
      await request(app.getHttpServer())
        .patch('/api/billing/platform/general')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ trialDays: 30 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/stores/signup')
        .send({
          storeName: 'Loja Trial 30',
          adminName: 'Dono Trial',
          adminEmail: 'trial30@exemplo.com',
          adminPassword: 'senha123',
          sellerDocType: 'CPF',
          sellerDocument: VALID_CPF,
          phone: '11988887777',
          ...ADDRESS,
        })
        .expect(201);

      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      const daysLeft =
        (store.planDueAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysLeft).toBeGreaterThan(29);
      expect(daysLeft).toBeLessThan(31);
    });

    it('lojista comum não altera o trial', async () => {
      const seed = await seedStore(prisma);
      const token = await signAdminToken(app, seed.admin);

      await request(app.getHttpServer())
        .patch('/api/billing/platform/general')
        .set('Authorization', `Bearer ${token}`)
        .send({ trialDays: 1 })
        .expect(403);
    });
  });
});
