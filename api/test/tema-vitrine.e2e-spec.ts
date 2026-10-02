import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
} from './helpers/test-app';

/** Tema da vitrine: o lojista escolhe no painel e a vitrine recebe pronto */
describe('Tema da vitrine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let loja: Awaited<ReturnType<typeof seedStore>>;
  let token: string;

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
    loja = await seedStore(prisma, { slug: 'loja-tema' });
    token = await signAdminToken(app, loja.admin);
  });

  const branding = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch('/api/stores/me/branding')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-slug', loja.store.slug)
      .send(body);

  const vitrine = () =>
    request(app.getHttpServer()).get('/api/stores/public/loja-tema');

  it('sem escolha, a vitrine recebe o Essencial', async () => {
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('essencial');
  });

  it('salva o tema e a vitrine recebe a fonte e a foto sugeridas por ele', async () => {
    await branding({
      storeTheme: 'boutique',
      storeFont: '',
      storeCardRatio: '',
    }).expect(200);
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('boutique');
    expect(r.body.storeFont).toBe('elegante');
    expect(r.body.storeCardRatio).toBe('alto');
  });

  it('escolha manual de fonte vale mais que a sugestão do tema', async () => {
    await branding({ storeTheme: 'tech', storeFont: 'amigavel' }).expect(200);
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('tech');
    expect(r.body.storeFont).toBe('amigavel');
    expect(r.body.storeCardRatio).toBe('quadrado');
  });

  it('recusa tema que não existe', async () => {
    await branding({ storeTheme: 'hacker' }).expect(400);
  });
});
