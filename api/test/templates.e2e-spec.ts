import { INestApplication } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  resetDb,
  seedStore,
  signAdminToken,
} from './helpers/test-app';

/*
 * Templates prontos: vêm do banco (migration traz 16), o lojista escolhe,
 * a vitrine recebe a receita pronta e o Super Admin libera, edita e exclui.
 */
describe('Templates da vitrine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let loja: Awaited<ReturnType<typeof seedStore>>;
  let token: string;
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
    // Os testes mexem nestes campos; volta tudo ao que a migration criou
    await prisma.template.deleteMany({
      where: { chave: { startsWith: 'teste-' } },
    });
    await prisma.template.updateMany({
      data: { ativo: true, acesso: 'gratis', planos: [], precoCentavos: null },
    });
    loja = await seedStore(prisma, { slug: 'loja-tpl' });
    token = await signAdminToken(app, loja.admin);
    const superAdmin = await prisma.user.create({
      data: {
        email: 'super-tpl@teste.com',
        passwordHash: 'x',
        name: 'Super',
        role: 'SUPER_ADMIN',
      },
    });
    superToken = await signAdminToken(app, superAdmin);
  });

  const http = () => request(app.getHttpServer());
  const branding = (body: Record<string, unknown>) =>
    http()
      .patch('/api/stores/me/branding')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-slug', loja.store.slug)
      .send(body);
  const vitrine = () => http().get('/api/stores/public/loja-tpl');
  const sup = (m: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    http()[m](url).set('Authorization', `Bearer ${superToken}`);

  it('a migration traz os 16 templates iniciais', async () => {
    expect(await prisma.template.count()).toBeGreaterThanOrEqual(16);
  });

  it('sem escolha, a vitrine recebe o Essencial com a receita', async () => {
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('essencial');
    expect(r.body.template.receita.fundo).toBe('#ffffff');
  });

  it('salva o template e a vitrine recebe a receita, a fonte e a foto dele', async () => {
    await branding({
      storeTheme: 'boutique',
      storeFont: '',
      storeCardRatio: '',
    }).expect(200);
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('boutique');
    expect(r.body.template.receita.banner).toBe('cheio');
    expect(r.body.storeFont).toBe('elegante');
    expect(r.body.storeCardRatio).toBe('alto');
  });

  it('escolha manual de fonte vale mais que a do template', async () => {
    await branding({ storeTheme: 'tech', storeFont: 'amigavel' }).expect(200);
    const r = await vitrine().expect(200);
    expect(r.body.storeFont).toBe('amigavel');
    expect(r.body.storeCardRatio).toBe('quadrado');
  });

  it('recusa template que não existe ou está desativado', async () => {
    await branding({ storeTheme: 'nao-existe' }).expect(400);
    await prisma.template.update({
      where: { chave: 'pet' },
      data: { ativo: false },
    });
    await branding({ storeTheme: 'pet' }).expect(400);
  });

  it('template de plano: bloqueia fora do plano, libera no plano e no teste grátis', async () => {
    await prisma.template.update({
      where: { chave: 'joias' },
      data: { acesso: 'plano', planos: ['plan-seed-pro'] },
    });
    await prisma.store.update({
      where: { id: loja.store.id },
      data: { status: StoreStatus.ACTIVE, planName: 'plan-seed-comeco' },
    });
    await branding({ storeTheme: 'joias' }).expect(403);

    await prisma.store.update({
      where: { id: loja.store.id },
      data: { status: StoreStatus.TRIAL },
    });
    await branding({ storeTheme: 'joias' }).expect(200);

    await prisma.store.update({
      where: { id: loja.store.id },
      data: { status: StoreStatus.ACTIVE, planName: 'plan-seed-pro' },
    });
    await branding({ storeTheme: 'joias' }).expect(200);
  });

  it('template pago: só depois da compra (ou cortesia)', async () => {
    await prisma.template.update({
      where: { chave: 'casa' },
      data: { acesso: 'pago', precoCentavos: 29900 },
    });
    await branding({ storeTheme: 'casa' }).expect(403);
    const galeria = await http()
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-slug', loja.store.slug)
      .expect(200);
    const casa = galeria.body.find(
      (t: { chave: string }) => t.chave === 'casa',
    );
    expect(casa.liberacao).toEqual({ liberado: false, precisa: 'compra' });

    await sup('post', '/api/super/templates/casa/cortesia')
      .send({ storeId: loja.store.id })
      .expect(201);
    await branding({ storeTheme: 'casa' }).expect(200);
  });

  it('Super Admin cria (nasce desativado), ativa, edita e exclui; lojas voltam ao Essencial', async () => {
    await sup('post', '/api/super/templates')
      .send({
        chave: 'teste-novo',
        nome: 'Teste Novo',
        paraQuem: 'Teste',
        descricao: 'Criado no teste',
        receita: { fundo: '#112233', cantos: 'redondos', cor_estranha: 'x' },
      })
      .expect(201);
    const criado = await prisma.template.findUniqueOrThrow({
      where: { chave: 'teste-novo' },
    });
    expect(criado.ativo).toBe(false);
    // Receita é normalizada: campo estranho some, faltando cai no padrão
    expect(criado.receita).toMatchObject({
      fundo: '#112233',
      cantos: 'redondos',
      banner: 'caixa',
    });
    expect(criado.receita).not.toHaveProperty('cor_estranha');

    await branding({ storeTheme: 'teste-novo' }).expect(400);
    await sup('patch', '/api/super/templates/teste-novo')
      .send({ ativo: true })
      .expect(200);
    await branding({ storeTheme: 'teste-novo' }).expect(200);

    const lista = await sup('get', '/api/super/templates').expect(200);
    expect(
      lista.body.find((t: { chave: string }) => t.chave === 'teste-novo').lojas,
    ).toBe(1);

    const del = await sup('delete', '/api/super/templates/teste-novo').expect(
      200,
    );
    expect(del.body.lojasMovidas).toBe(1);
    const r = await vitrine().expect(200);
    expect(r.body.storeTheme).toBe('essencial');
  });

  it('o Essencial não pode ser desativado nem excluído', async () => {
    await sup('patch', '/api/super/templates/essencial')
      .send({ ativo: false })
      .expect(400);
    await sup('delete', '/api/super/templates/essencial').expect(400);
  });

  it('lojista não acessa as rotas do Super Admin', async () => {
    await http()
      .get('/api/super/templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
