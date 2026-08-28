import { INestApplication } from '@nestjs/common';
import { SellerDocType, StoreStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/test-app';

// Documentos com dígito verificador válido pelo mesmo algoritmo da API.
const VALID_CPF = '11144477735';
const VALID_CNPJ = '11222333000181';

const VALID_ADDRESS = {
  zipCode: '01310100',
  street: 'Avenida Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
};

/**
 * Signup público (sem autenticação): qualquer visitante cria a própria loja.
 * Como é a única rota da API sem guard nenhum, o que mais importa aqui é
 * garantir que ninguém consiga sair dela já com acesso pago — e que os dados
 * fiscais (CPF/CNPJ, telefone, endereço) sejam de verdade, não lixo.
 */
describe('Signup público (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  const signup = (body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/stores/signup')
      .send({
        storeName: 'Loja da Maria',
        adminName: 'Maria Lojista',
        adminEmail: 'maria@exemplo.com',
        adminPassword: 'senha-forte-123',
        sellerDocType: SellerDocType.CPF,
        sellerDocument: VALID_CPF,
        phone: '11988887777',
        ...VALID_ADDRESS,
        ...body,
      });

  it('cria a loja e devolve token pronto pro painel', async () => {
    const res = await signup().expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('STORE_ADMIN');
    expect(res.body.slug).toBeTruthy();
  });

  it('a loja nasce sempre em TRIAL, nunca ACTIVE', async () => {
    const res = await signup().expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.status).toBe(StoreStatus.TRIAL);
    expect(Number(store.monthlyFee)).toBeGreaterThan(0);
  });

  it('recusa tentativa de injetar status/pagamento no corpo (whitelist)', async () => {
    // PublicSignupDto não declara esses campos — forbidNonWhitelisted barra
    // a request inteira antes mesmo de chegar no service.
    await signup({
      status: 'ACTIVE',
      planDueAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      monthlyFee: 0,
    }).expect(400);

    const count = await prisma.store.count();
    expect(count).toBe(0);
  });

  it('o trial dura ~14 dias por padrão', async () => {
    const res = await signup().expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });

    const daysLeft =
      (store.planDueAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysLeft).toBeGreaterThan(13);
    expect(daysLeft).toBeLessThan(15);
  });

  it('o token devolvido já pertence à loja recém-criada', async () => {
    const res = await signup().expect(201);

    await request(app.getHttpServer())
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('cria categorias padrão (loja não nasce vazia de estrutura)', async () => {
    const res = await signup().expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    const categories = await prisma.category.count({
      where: { storeId: store.id },
    });
    expect(categories).toBeGreaterThan(0);
  });

  it('gera slug alternativo quando o nome já existe (não trava o cadastro)', async () => {
    const a = await signup().expect(201);
    const b = await signup({ adminEmail: 'outra@exemplo.com' }).expect(201);

    expect(a.body.slug).not.toBe(b.body.slug);
    expect(b.body.slug).toMatch(/^loja-da-maria-\d+$/);
  });

  it('usa o plano pedido para exibição, mas não deixa de ser trial', async () => {
    // Ids fixos semeados pela migration 20260815160000_platform_plans
    const res = await signup({ planId: 'plan-seed-pro' }).expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.planName).toBe('Pro');
    expect(store.status).toBe(StoreStatus.TRIAL);
  });

  it('ignora plano inexistente e cai no primeiro da lista', async () => {
    const res = await signup({ planId: 'plano-que-nao-existe' }).expect(201);
    const store = await prisma.store.findUniqueOrThrow({
      where: { slug: res.body.slug },
    });
    expect(store.planName).toBeTruthy();
  });

  describe('documento (CPF/CNPJ)', () => {
    it('aceita CPF com dígito verificador válido', async () => {
      const res = await signup({
        sellerDocType: SellerDocType.CPF,
        sellerDocument: VALID_CPF,
      }).expect(201);
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      expect(store.sellerDocType).toBe(SellerDocType.CPF);
      expect(store.sellerDocument).toBe(VALID_CPF);
      // CPF: razão social vira o nome de quem cadastrou
      expect(store.sellerLegalName).toBe('Maria Lojista');
    });

    it('aceita CNPJ com dígito verificador válido', async () => {
      const res = await signup({
        sellerDocType: SellerDocType.CNPJ,
        sellerDocument: VALID_CNPJ,
      }).expect(201);
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      expect(store.sellerDocType).toBe(SellerDocType.CNPJ);
      expect(store.sellerDocument).toBe(VALID_CNPJ);
      // CNPJ: razão social vira o nome da loja
      expect(store.sellerLegalName).toBe('Loja da Maria');
    });

    it('recusa CPF com dígito verificador errado', async () => {
      await signup({
        sellerDocType: SellerDocType.CPF,
        sellerDocument: '11144477736', // último dígito trocado
      }).expect(400);
    });

    it('recusa CNPJ com dígito verificador errado', async () => {
      await signup({
        sellerDocType: SellerDocType.CNPJ,
        sellerDocument: '11222333000182',
      }).expect(400);
    });

    it('recusa CPF com todos os dígitos iguais', async () => {
      await signup({
        sellerDocType: SellerDocType.CPF,
        sellerDocument: '11111111111',
      }).expect(400);
    });

    it('recusa documento ausente', async () => {
      await signup({ sellerDocument: undefined }).expect(400);
    });
  });

  describe('telefone', () => {
    it('aceita celular válido (11 dígitos, terceiro é 9)', async () => {
      const res = await signup({ phone: '11988887777' }).expect(201);
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      expect(store.sellerPhone).toBe('11988887777');
    });

    it('aceita fixo válido (10 dígitos)', async () => {
      await signup({ phone: '1133334444' }).expect(201);
    });

    it('recusa DDD inexistente', async () => {
      await signup({ phone: '00988887777' }).expect(400);
    });

    it('recusa número com todos os dígitos iguais', async () => {
      await signup({ phone: '11999999999' }).expect(400);
    });

    it('recusa celular sem o 9 na frente', async () => {
      await signup({ phone: '11888887777' }).expect(400);
    });

    it('recusa telefone curto demais', async () => {
      await signup({ phone: '119999' }).expect(400);
    });
  });

  describe('endereço', () => {
    it('grava o endereço completo do lojista', async () => {
      const res = await signup().expect(201);
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      expect(store.sellerZipCode).toBe('01310100');
      expect(store.sellerStreet).toBe('Avenida Paulista');
      expect(store.sellerCity).toBe('São Paulo');
      expect(store.sellerState).toBe('SP');
    });

    it('usa o mesmo endereço como origem do frete (evita pedir duas vezes)', async () => {
      const res = await signup().expect(201);
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: res.body.slug },
      });
      expect(store.freteCepOrigem).toBe(store.sellerZipCode);
      expect(store.freteRuaOrigem).toBe(store.sellerStreet);
      expect(store.freteCidadeOrigem).toBe(store.sellerCity);
      expect(store.freteUfOrigem).toBe(store.sellerState);
      expect(store.freteEmailContato).toBe('maria@exemplo.com');
    });

    it('recusa CEP com tamanho errado', async () => {
      await signup({ zipCode: '123' }).expect(400);
    });

    it('recusa UF inválida', async () => {
      await signup({ state: 'ZZ' }).expect(400);
    });

    it('recusa endereço sem rua', async () => {
      await signup({ street: undefined }).expect(400);
    });

    it('recusa endereço sem cidade', async () => {
      await signup({ city: undefined }).expect(400);
    });

    it('complemento é opcional', async () => {
      await signup({ complement: 'Sala 401' }).expect(201);
      await signup({
        adminEmail: 'sem-complemento@exemplo.com',
        complement: undefined,
      }).expect(201);
    });
  });

  describe('validação geral', () => {
    it('recusa senha curta', async () => {
      await signup({ adminPassword: '123' }).expect(400);
    });

    it('recusa e-mail inválido', async () => {
      await signup({ adminEmail: 'não-é-email' }).expect(400);
    });

    it('recusa nome de loja vazio', async () => {
      await signup({ storeName: '' }).expect(400);
    });

    it('não aceita campo fora da whitelist (forbidNonWhitelisted)', async () => {
      await signup({ role: 'SUPER_ADMIN' }).expect(400);
    });
  });

  it('devolve GET /public/plans sem autenticação', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/plans')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('amount');
  });
});
