import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { base32Decode, codigoDoPasso, passoAtual } from '../src/auth/totp';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb, signAdminToken } from './helpers/test-app';

/*
 * Equipe do Super Admin: o dono cria um colaborador com senha provisória e
 * as áreas que ele pode usar. O colaborador troca a senha, ativa o 2FA e só
 * enxerga o que foi liberado. Tudo que o Super Admin altera fica registrado.
 */
describe('Equipe do Super Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ipSeq = 0;
  let tokenDono: string;
  let donoId: string;

  const PROVISORIA = 'provisoria-1234';
  const NOVA = 'senha-nova-do-colaborador';

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
    const dono = await prisma.user.create({
      data: {
        email: 'dono@vendira.test',
        passwordHash: await bcrypt.hash('senha-do-dono-123', 10),
        name: 'Dono',
        role: Role.SUPER_ADMIN,
        // 2FA já ativo: o token assinado no teste vale como sessão completa
        totpEnabledAt: new Date(),
      },
    });
    donoId = dono.id;
    tokenDono = await signAdminToken(app, dono);
  });

  /** Cada chamada sai de um IP diferente (limite de tentativas por IP). */
  const http = () => {
    const agent = request(app.getHttpServer());
    const ip = `203.0.113.${++ipSeq % 250}`;
    return {
      get: (url: string) => agent.get(url).set('X-Forwarded-For', ip),
      post: (url: string) => agent.post(url).set('X-Forwarded-For', ip),
      patch: (url: string) => agent.patch(url).set('X-Forwarded-For', ip),
      delete: (url: string) => agent.delete(url).set('X-Forwarded-For', ip),
    };
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function criarColaborador(permissoes: string[] = ['lojas']) {
    const res = await http()
      .post('/api/super/equipe')
      .set(auth(tokenDono))
      .send({
        name: 'Ana Suporte',
        email: 'ana@vendira.test',
        senhaProvisoria: PROVISORIA,
        permissoes,
      })
      .expect(201);
    return res.body.id as string;
  }

  /** Primeiro acesso completo: senha provisória → troca → 2FA → sessão. */
  async function primeiroAcesso() {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'ana@vendira.test', password: PROVISORIA })
      .expect(201);
    const troca = await http()
      .post('/api/auth/trocar-senha')
      .set(auth(login.body.accessToken))
      .send({ atual: PROVISORIA, nova: NOVA })
      .expect(201);
    const t = troca.body.accessToken as string;
    const ini = await http()
      .post('/api/auth/2fa/ativar')
      .set(auth(t))
      .expect(201);
    const codigo = codigoDoPasso(
      base32Decode(String(ini.body.chave).replace(/\s+/g, '')),
      passoAtual(),
    );
    const conf = await http()
      .post('/api/auth/2fa/confirmar')
      .set(auth(t))
      .send({ codigo })
      .expect(201);
    return conf.body.accessToken as string;
  }

  it('senha provisória: só abre a troca de senha até trocar', async () => {
    await criarColaborador();
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'ana@vendira.test', password: PROVISORIA })
      .expect(201);
    const t = login.body.accessToken as string;

    const me = await http().get('/api/auth/me').set(auth(t)).expect(200);
    expect(me.body.trocarSenha).toBe(true);
    expect(me.body.dono).toBe(false);
    expect(me.body.permissoes).toEqual(['lojas']);

    const barrado = await http().get('/api/stores').set(auth(t)).expect(403);
    expect(barrado.body.message).toMatch(/senha provisória/);

    // a senha atual errada não troca
    await http()
      .post('/api/auth/trocar-senha')
      .set(auth(t))
      .send({ atual: 'errada', nova: NOVA })
      .expect(400);
  });

  it('colaborador só usa as áreas liberadas', async () => {
    await criarColaborador(['lojas', 'templates']);
    const t = await primeiroAcesso();

    await http().get('/api/stores').set(auth(t)).expect(200);
    await http().get('/api/super/templates').set(auth(t)).expect(200);

    // fora do que foi liberado
    await http().get('/api/billing/platform/general').set(auth(t)).expect(403);
    await http().get('/api/platform-fee/relatorio').set(auth(t)).expect(403);
    // só do dono, com qualquer área
    await http()
      .get('/api/billing/platform/mercadopago')
      .set(auth(t))
      .expect(403);
    await http().get('/api/super/equipe').set(auth(t)).expect(403);
  });

  it('o dono muda as áreas e desativa: vale na hora', async () => {
    const id = await criarColaborador(['lojas']);
    const t = await primeiroAcesso();
    await http().get('/api/billing/platform/general').set(auth(t)).expect(403);

    await http()
      .patch(`/api/super/equipe/${id}`)
      .set(auth(tokenDono))
      .send({ permissoes: ['planos'] })
      .expect(200);
    await http().get('/api/billing/platform/general').set(auth(t)).expect(200);
    await http().get('/api/stores').set(auth(t)).expect(403);

    await http()
      .patch(`/api/super/equipe/${id}`)
      .set(auth(tokenDono))
      .send({ ativo: false })
      .expect(200);
    await http().get('/api/auth/me').set(auth(t)).expect(401);
    await http()
      .post('/api/auth/login')
      .send({ email: 'ana@vendira.test', password: NOVA })
      .expect(401);
  });

  it('nova senha provisória derruba a sessão e pede troca de novo', async () => {
    const id = await criarColaborador();
    const t = await primeiroAcesso();
    await http()
      .patch(`/api/super/equipe/${id}`)
      .set(auth(tokenDono))
      .send({ senhaProvisoria: 'outra-provisoria-99' })
      .expect(200);
    await http().get('/api/auth/me').set(auth(t)).expect(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(u.senhaProvisoria).toBe(true);
  });

  it('não deixa repetir e-mail, nem mexer no dono', async () => {
    await criarColaborador();
    await http()
      .post('/api/super/equipe')
      .set(auth(tokenDono))
      .send({
        name: 'Outra',
        email: 'ANA@vendira.test',
        senhaProvisoria: PROVISORIA,
        permissoes: ['lojas'],
      })
      .expect(409);
    await http()
      .post('/api/super/equipe')
      .set(auth(tokenDono))
      .send({
        name: 'Sem área',
        email: 'nada@vendira.test',
        senhaProvisoria: PROVISORIA,
        permissoes: ['financeiro-inventado'],
      })
      .expect(400);
    await http()
      .delete(`/api/super/equipe/${donoId}`)
      .set(auth(tokenDono))
      .expect(400);

    const lista = await http()
      .get('/api/super/equipe')
      .set(auth(tokenDono))
      .expect(200);
    expect(lista.body.membros).toHaveLength(2);
    expect(lista.body.membros[0].dono).toBe(true);
    expect(lista.body.areas.map((a: { chave: string }) => a.chave)).toEqual([
      'lojas',
      'planos',
      'comissoes',
      'templates',
    ]);
  });

  it('registra quem fez cada alteração', async () => {
    const id = await criarColaborador();
    await http()
      .patch(`/api/super/equipe/${id}`)
      .set(auth(tokenDono))
      .send({ permissoes: ['planos'] })
      .expect(200);

    // a gravação é em segundo plano: espera aparecer
    let linhas: { userEmail: string; method: string; path: string }[] = [];
    for (let i = 0; i < 20 && linhas.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
      linhas = await prisma.platformAuditLog.findMany({
        orderBy: { createdAt: 'asc' },
      });
    }
    expect(linhas.map((l) => [l.userEmail, l.method, l.path])).toEqual([
      ['dono@vendira.test', 'POST', '/api/super/equipe'],
      ['dono@vendira.test', 'PATCH', `/api/super/equipe/${id}`],
    ]);

    const tela = await http()
      .get('/api/super/equipe/atividade')
      .set(auth(tokenDono))
      .expect(200);
    expect(tela.body[0].method).toBe('PATCH');
  });
});
