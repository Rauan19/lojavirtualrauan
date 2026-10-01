import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { base32Decode, codigoDoPasso, passoAtual } from '../src/auth/totp';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb, seedStore } from './helpers/test-app';

/*
 * Verificação em duas etapas (TOTP).
 *
 * O teste faz o papel do Google Authenticator: lê a chave que a tela de
 * ativação mostra e calcula o código igual ao app.
 */
describe('Verificação em duas etapas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ipSeq = 0;

  const SENHA = 'senha-super-forte-123';

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
  });

  /** Cada chamada sai de um IP diferente para não esbarrar no limite de tentativas por IP. */
  const http = () => {
    const agent = request(app.getHttpServer());
    const ip = `198.51.100.${++ipSeq % 250}`;
    return {
      get: (url: string) => agent.get(url).set('X-Forwarded-For', ip),
      post: (url: string) => agent.post(url).set('X-Forwarded-For', ip),
    };
  };

  async function criarSuperAdmin() {
    return prisma.user.create({
      data: {
        email: 'super@vendira.test',
        passwordHash: await bcrypt.hash(SENHA, 10),
        name: 'Super',
        role: Role.SUPER_ADMIN,
      },
    });
  }

  const login = (email: string, senha = SENHA) =>
    http().post('/api/auth/login').send({ email, password: senha });

  /** O "app do celular": código do passo atual (+desloc) a partir da chave mostrada. */
  const codigoDoApp = (chave: string, desloc = 0) =>
    codigoDoPasso(
      base32Decode(chave.replace(/\s+/g, '')),
      passoAtual() + desloc,
    );

  /** Ativa e devolve a chave, os códigos de recuperação e a sessão nova. */
  async function ativar(token: string) {
    const ini = await http()
      .post('/api/auth/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(ini.body.qrCode).toMatch(/^data:image\/png;base64,/);
    const conf = await http()
      .post('/api/auth/2fa/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: codigoDoApp(ini.body.chave) })
      .expect(201);
    return {
      chave: ini.body.chave as string,
      codigos: conf.body.codigosRecuperacao as string[],
      token: conf.body.accessToken as string,
    };
  }

  describe('Super Admin (obrigatório)', () => {
    it('sem 2FA, o login só abre a tela de ativação', async () => {
      await criarSuperAdmin();
      const res = await login('super@vendira.test').expect(201);
      expect(res.body.ativarDoisFatores).toBe(true);
      const token = res.body.accessToken as string;

      const me = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.doisFatores).toEqual({ ativo: false, obrigatorio: true });

      // o resto do painel fica fechado
      await http()
        .get('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('ativa com o app, recebe 10 códigos de recuperação e o painel abre', async () => {
      await criarSuperAdmin();
      const inicial = (await login('super@vendira.test').expect(201)).body
        .accessToken as string;
      const { codigos, token } = await ativar(inicial);

      expect(codigos).toHaveLength(10);
      // a sessão de ativação deixou de valer
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${inicial}`)
        .expect(401);
      await http()
        .get('/api/billing/platform/plans')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const banco = await prisma.user.findFirstOrThrow({
        where: { role: Role.SUPER_ADMIN },
      });
      // nada em texto puro no banco
      expect(banco.totpSecret).not.toContain(' ');
      expect(banco.totpSecret?.length).toBeGreaterThan(40);
      expect(banco.totpRecoveryHashes).not.toContain(codigos[0]);
    });

    it('com 2FA, a senha sozinha não entra: precisa do código', async () => {
      await criarSuperAdmin();
      const inicial = (await login('super@vendira.test')).body.accessToken;
      const { chave } = await ativar(inicial);

      const etapa1 = await login('super@vendira.test').expect(201);
      expect(etapa1.body.segundaEtapa).toBe(true);
      expect(etapa1.body.accessToken).toBeUndefined();

      // o passe da senha não serve como sessão
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${etapa1.body.desafio}`)
        .expect(401);

      await http()
        .post('/api/auth/2fa/login')
        .send({ desafio: etapa1.body.desafio, codigo: '000000' })
        .expect(401);

      // o código usado na ativação não vale de novo; o seguinte vale
      const ok = await http()
        .post('/api/auth/2fa/login')
        .send({ desafio: etapa1.body.desafio, codigo: codigoDoApp(chave, 1) })
        .expect(201);
      expect(ok.body.accessToken).toBeTruthy();
      expect(ok.body.user.role).toBe('SUPER_ADMIN');
    });

    it('código de recuperação entra uma vez só', async () => {
      await criarSuperAdmin();
      const inicial = (await login('super@vendira.test')).body.accessToken;
      const { codigos } = await ativar(inicial);

      const d1 = (await login('super@vendira.test')).body.desafio;
      const r1 = await http()
        .post('/api/auth/2fa/login')
        .send({ desafio: d1, codigo: codigos[0].toLowerCase() })
        .expect(201);
      expect(r1.body.codigosRecuperacaoRestantes).toBe(9);

      const d2 = (await login('super@vendira.test')).body.desafio;
      await http()
        .post('/api/auth/2fa/login')
        .send({ desafio: d2, codigo: codigos[0] })
        .expect(401);
    });

    it('5 códigos errados bloqueiam por 15 minutos, mesmo com o código certo depois', async () => {
      await criarSuperAdmin();
      const inicial = (await login('super@vendira.test')).body.accessToken;
      const { chave } = await ativar(inicial);
      const desafio = (await login('super@vendira.test')).body.desafio;

      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/auth/2fa/login')
          .send({ desafio, codigo: '111111' })
          .expect(401);
      }
      const bloqueado = await http()
        .post('/api/auth/2fa/login')
        .send({ desafio, codigo: codigoDoApp(chave, 1) })
        .expect(403);
      expect(bloqueado.body.message).toMatch(/Tente de novo em 15 minutos/);
    });

    it('Super Admin não consegue desligar o 2FA', async () => {
      await criarSuperAdmin();
      const inicial = (await login('super@vendira.test')).body.accessToken;
      const { chave, token } = await ativar(inicial);
      await http()
        .post('/api/auth/2fa/desativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ senha: SENHA, codigo: codigoDoApp(chave, 1) })
        .expect(403);
    });
  });

  describe('Lojista (opcional)', () => {
    it('sem 2FA entra direto, como sempre', async () => {
      const seed = await seedStore(prisma);
      const res = await login(seed.admin.email, seed.admin.password).expect(
        201,
      );
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.ativarDoisFatores).toBeUndefined();
      expect(res.body.segundaEtapa).toBeUndefined();
    });

    it('ativa, passa a pedir o código, e desativa com senha + código', async () => {
      const seed = await seedStore(prisma);
      const t0 = (await login(seed.admin.email, seed.admin.password)).body
        .accessToken;
      const { chave, token } = await ativar(t0);

      const etapa1 = await login(seed.admin.email, seed.admin.password);
      expect(etapa1.body.segundaEtapa).toBe(true);

      // senha errada não desliga
      await http()
        .post('/api/auth/2fa/desativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ senha: 'errada-123', codigo: codigoDoApp(chave, 1) })
        .expect(401);
      await http()
        .post('/api/auth/2fa/desativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ senha: seed.admin.password, codigo: codigoDoApp(chave, 1) })
        .expect(201);

      const depois = await login(seed.admin.email, seed.admin.password);
      expect(depois.body.accessToken).toBeTruthy();
      expect(depois.body.segundaEtapa).toBeUndefined();
    });
  });
});
