import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
  type SeededStore,
} from './helpers/test-app';

/*
 * Equipe da loja: o dono convida, a pessoa cria a senha pelo link e só entra
 * nas áreas que o dono liberou. Dinheiro e a equipe ficam só com o dono.
 */
describe('Equipe da loja (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeededStore;
  let convites: { to: string; text: string }[] = [];
  let ip = 0;
  let tokenDono = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    jest.spyOn(app.get(MailService), 'send').mockImplementation(async (i) => {
      const e = i as { to: string; subject: string; text: string };
      if (/equipe/.test(e.subject)) convites.push(e);
      return { sent: true };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    convites = [];
    seed = await seedStore(prisma);
    tokenDono = await signAdminToken(app, seed.admin);
  });

  const http = () => request(app.getHttpServer());
  const comDono = (r: request.Test) =>
    r
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${tokenDono}`)
      .set('X-Forwarded-For', `198.51.100.${++ip}`);

  const convidar = (body: Record<string, unknown>) =>
    comDono(http().post('/api/admin/equipe')).send(body);

  /** Convida, cria a senha pelo link e devolve a sessão do funcionário. */
  async function entrarComo(permissoes: string[], email = 'bia@teste.com') {
    await convidar({ name: 'Bia Souza', email, permissoes }).expect(201);
    const link =
      convites[convites.length - 1].text.match(/token=([a-f0-9]+)/)![1];
    await http()
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', `198.51.100.${++ip}`)
      .send({ token: link, password: 'senha-da-bia-123' })
      .expect(201);
    const login = await http()
      .post('/api/auth/login')
      .set('X-Forwarded-For', `198.51.100.${++ip}`)
      .send({ email, password: 'senha-da-bia-123' })
      .expect(201);
    return login.body as {
      accessToken: string;
      user: { dono: boolean; permissoes: string[] };
    };
  }

  const como = (token: string, r: request.Test) =>
    r
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', `198.51.100.${++ip}`);

  it('convite chega por e-mail e a pessoa entra com a própria senha', async () => {
    const sessao = await entrarComo(['pedidos']);
    expect(convites[0].to).toBe('bia@teste.com');
    expect(convites[0].text).toMatch(/Pedidos e reembolsos/);
    expect(sessao.user).toMatchObject({ dono: false, permissoes: ['pedidos'] });

    const lista = await comDono(http().get('/api/admin/equipe'))
      .expect(200)
      .then((r) => r.body);
    expect(lista.membros).toHaveLength(2);
    expect(lista.membros[0]).toMatchObject({ dono: true });
    expect(lista.membros[1]).toMatchObject({
      email: 'bia@teste.com',
      convitePendente: false,
    });
  });

  it('funcionário só usa as áreas liberadas', async () => {
    const { accessToken: t } = await entrarComo(['pedidos']);
    await como(t, http().get('/api/admin/orders')).expect(200);
    // faturamento é só do dono
    await como(t, http().get('/api/admin/dashboard/summary')).expect(403);
    await como(t, http().get('/api/stores/me')).expect(200);

    const barrado = await como(t, http().get('/api/admin/products')).expect(
      403,
    );
    expect(barrado.body.message).toMatch(/Fale com o dono/);
    await como(t, http().get('/api/admin/customers')).expect(403);
    await como(t, http().patch('/api/stores/me/branding').send({})).expect(403);
  });

  it('dinheiro e equipe são só do dono, mesmo com todas as áreas', async () => {
    const { accessToken: t } = await entrarComo([
      'pedidos',
      'produtos',
      'clientes',
      'marketing',
      'configuracoes',
    ]);
    await como(t, http().get('/api/admin/products')).expect(200);
    await como(t, http().get('/api/admin/equipe')).expect(403);
    await como(t, http().get('/api/billing/me')).expect(403);
    await como(t, http().get('/api/platform-fee/me')).expect(403);
    await como(
      t,
      http()
        .post('/api/admin/equipe')
        .send({
          name: 'Intruso',
          email: 'intruso@teste.com',
          permissoes: ['pedidos'],
        }),
    ).expect(403);
  });

  it('dono muda as áreas e vale na hora; desativar derruba a sessão', async () => {
    const { accessToken: t } = await entrarComo(['pedidos']);
    const bia = await prisma.user.findFirstOrThrow({
      where: { email: 'bia@teste.com' },
    });

    await comDono(http().patch(`/api/admin/equipe/${bia.id}`))
      .send({ permissoes: ['produtos'] })
      .expect(200);
    await como(t, http().get('/api/admin/products')).expect(200);
    await como(t, http().get('/api/admin/orders')).expect(403);

    await comDono(http().patch(`/api/admin/equipe/${bia.id}`))
      .send({ ativo: false })
      .expect(200);
    await como(t, http().get('/api/admin/products')).expect(401);
  });

  it('o dono não pode ser alterado nem removido pela equipe', async () => {
    await comDono(http().patch(`/api/admin/equipe/${seed.admin.id}`))
      .send({ ativo: false })
      .expect(400);
    await comDono(http().delete(`/api/admin/equipe/${seed.admin.id}`)).expect(
      400,
    );
  });

  it('respeita o limite de pessoas do plano', async () => {
    await prisma.platformPlan.upsert({
      where: { id: 'plano-dupla' },
      create: {
        id: 'plano-dupla',
        name: 'Dupla',
        amount: 10,
        periodDays: 30,
        maxUsers: 2,
        features: [],
      },
      update: { maxUsers: 2 },
    });
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { planName: 'plano-dupla', status: 'ACTIVE' },
    });
    await convidar({
      name: 'Bia',
      email: 'bia@teste.com',
      permissoes: ['pedidos'],
    }).expect(201);
    const cheio = await convidar({
      name: 'Caio',
      email: 'caio@teste.com',
      permissoes: ['pedidos'],
    }).expect(403);
    expect(cheio.body.message).toMatch(/até 2 pessoas/);

    // desativada não conta; reativar quando cheio é barrado
    const bia = await prisma.user.findFirstOrThrow({
      where: { email: 'bia@teste.com' },
    });
    await comDono(http().patch(`/api/admin/equipe/${bia.id}`))
      .send({ ativo: false })
      .expect(200);
    await convidar({
      name: 'Caio',
      email: 'caio@teste.com',
      permissoes: ['pedidos'],
    }).expect(201);
    await comDono(http().patch(`/api/admin/equipe/${bia.id}`))
      .send({ ativo: true })
      .expect(403);
  });

  it('e-mail de outro painel e área inválida são recusados', async () => {
    const outra = await seedStore(prisma);
    const dup = await convidar({
      name: 'Dono de outra',
      email: outra.admin.email,
      permissoes: ['pedidos'],
    }).expect(409);
    expect(dup.body.message).toMatch(/outro painel/);
    await convidar({
      name: 'Bia',
      email: 'bia@teste.com',
      permissoes: ['financeiro'],
    }).expect(400);
    await convidar({
      name: 'Bia',
      email: 'bia@teste.com',
      permissoes: [],
    }).expect(400);
  });

  it('dono de uma loja não mexe na equipe de outra', async () => {
    const outra = await seedStore(prisma);
    await entrarComo(['pedidos']);
    const bia = await prisma.user.findFirstOrThrow({
      where: { email: 'bia@teste.com' },
    });
    await http()
      .delete(`/api/admin/equipe/${bia.id}`)
      .set('x-store-slug', seed.store.slug)
      .set('Authorization', `Bearer ${await signAdminToken(app, outra.admin)}`)
      .expect(404);
    expect(await prisma.user.count({ where: { id: bia.id } })).toBe(1);
  });
});
