import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AccessLogService } from '../src/common/access-log.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signCustomerToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * Registro de acesso à aplicação (Marco Civil art. 15).
 *
 * Guardar 6 meses é obrigação; guardar além disso é passivo — vira dado
 * pessoal acumulado sem base legal.
 */
describe('Registro de acesso (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessLog: AccessLogService;
  let seed: SeededStore;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    accessLog = app.get(AccessLogService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.accessLog.deleteMany({});
    seed = await seedStore(prisma);
    // o cache de deduplicação vive no processo e atravessaria os testes
    (accessLog as unknown as { recentes: Map<string, number> }).recentes.clear();
  });

  it('registra o acesso de um visitante', async () => {
    await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}`)
      .set('X-Forwarded-For', '203.0.113.9')
      .expect(200);

    const logs = await prisma.accessLog.findMany({});
    expect(logs).toHaveLength(1);
    expect(logs[0].ip).toBe('203.0.113.9');
    expect(logs[0].path).toContain('/stores/public/');
  });

  it('pega o IP real quando está atrás de proxy', async () => {
    await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}`)
      .set('X-Forwarded-For', '198.51.100.7, 10.0.0.1, 10.0.0.2')
      .expect(200);

    const log = await prisma.accessLog.findFirstOrThrow({});
    // o primeiro da lista é o cliente; os outros são os proxies do caminho
    expect(log.ip).toBe('198.51.100.7');
  });

  it('não guarda a query string', async () => {
    await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}?utm_source=x&token=segredo`)
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(200);

    const log = await prisma.accessLog.findFirstOrThrow({});
    expect(log.path).not.toContain('segredo');
    expect(log.path).not.toContain('?');
  });

  it('grava uma linha por hora, não uma por requisição', async () => {
    for (let i = 0; i < 6; i++) {
      await request(app.getHttpServer())
        .get(`/api/stores/public/${seed.store.slug}`)
        .set('X-Forwarded-For', '203.0.113.11')
        .expect(200);
    }

    expect(await prisma.accessLog.count()).toBe(1);
  });

  it('separa titulares diferentes no mesmo IP', async () => {
    const token = await signCustomerToken(app, seed.customer);

    await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}`)
      .set('X-Forwarded-For', '203.0.113.12')
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/storefront/auth/me')
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '203.0.113.12')
      .expect(200);

    const logs = await prisma.accessLog.findMany({});
    expect(logs).toHaveLength(2);
    expect(logs.some((l) => l.customerId === seed.customer.id)).toBe(true);
    expect(logs.some((l) => l.customerId === null)).toBe(true);
  });

  it('apaga o que passou de 6 meses e mantém o resto', async () => {
    const antigo = await prisma.accessLog.create({
      data: { ip: '203.0.113.1', path: '/api/antigo' },
    });
    const recente = await prisma.accessLog.create({
      data: { ip: '203.0.113.2', path: '/api/recente' },
    });
    await prisma.accessLog.update({
      where: { id: antigo.id },
      data: { createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
    });
    await prisma.accessLog.update({
      where: { id: recente.id },
      // 5 meses: ainda dentro do prazo que a lei manda guardar
      data: { createdAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000) },
    });

    await accessLog.limparAntigos();

    const restantes = await prisma.accessLog.findMany({});
    expect(restantes.map((l) => l.id)).toEqual([recente.id]);
  });

  it('falha ao registrar não derruba a requisição', async () => {
    const spy = jest
      .spyOn(prisma.accessLog, 'create')
      .mockRejectedValue(new Error('banco fora do ar'));

    await request(app.getHttpServer())
      .get(`/api/stores/public/${seed.store.slug}`)
      .set('X-Forwarded-For', '203.0.113.13')
      .expect(200);

    spy.mockRestore();
  });
});
