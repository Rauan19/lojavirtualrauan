import { INestApplication } from '@nestjs/common';
import { SellerDocType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb, seedStore } from './helpers/test-app';

/*
 * Políticas da vitrine.
 *
 * Loja não pode ir ao ar sem condições de venda, política de trocas e
 * política de privacidade: as duas primeiras são exigidas pelo Decreto
 * 7.962/2013, a terceira pela LGPD. Antes, loja nova nascia com os três
 * campos vazios e o lojista ficava irregular sem ter feito nada.
 */
describe('Políticas da loja (e2e)', () => {
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

  function publica(slug: string) {
    return request(app.getHttpServer()).get(`/api/stores/public/${slug}`);
  }

  /*
   * O texto padrão é escrito em template literal, então quebra de linha do
   * fonte vira quebra dentro do parágrafo. Em HTML isso não muda nada, mas
   * partiria asserção como "artigo 49" ao meio — normaliza antes de comparar.
   */
  const texto = (html: unknown) => String(html || '').replace(/\s+/g, ' ');

  it('loja recém-criada já tem as três políticas preenchidas', async () => {
    const seed = await seedStore(prisma);
    const res = await publica(seed.store.slug).expect(200);

    for (const campo of ['termsHtml', 'privacyHtml', 'returnsHtml']) {
      const texto = String(res.body[campo] || '').replace(/<[^>]*>/g, '');
      expect(texto.trim().length).toBeGreaterThan(200);
    }
  });

  it('condições de venda trazem arrependimento e garantia legal', async () => {
    const seed = await seedStore(prisma);
    const res = await publica(seed.store.slug).expect(200);

    expect(texto(res.body.termsHtml)).toContain('7 dias');
    expect(texto(res.body.termsHtml)).toContain('artigo 49');
    expect(texto(res.body.termsHtml)).toContain('artigo 26');
  });

  it('política de trocas diz quem paga o frete da devolução', async () => {
    const seed = await seedStore(prisma);
    const res = await publica(seed.store.slug).expect(200);

    expect(texto(res.body.returnsHtml)).toContain('7 dias');
    expect(texto(res.body.returnsHtml)).toContain('envio de volta é da loja');
  });

  it('privacidade lista os direitos do titular e a base legal', async () => {
    const seed = await seedStore(prisma);
    const res = await publica(seed.store.slug).expect(200);

    expect(texto(res.body.privacyHtml)).toContain('LGPD');
    expect(texto(res.body.privacyHtml)).toContain('artigo 18');
    expect(texto(res.body.privacyHtml)).toContain('portabilidade');
  });

  it('identifica o vendedor com CNPJ quando a loja é empresa', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        sellerDocType: SellerDocType.CNPJ,
        sellerDocument: '12345678000199',
        sellerLegalName: 'Comércio Teste LTDA',
        sellerStreet: 'Rua das Flores',
        sellerNumber: '100',
        sellerCity: 'Salvador',
        sellerState: 'BA',
        sellerZipCode: '40000000',
      },
    });

    const res = await publica(seed.store.slug).expect(200);
    expect(texto(res.body.termsHtml)).toContain('Comércio Teste LTDA');
    expect(texto(res.body.termsHtml)).toContain('12.345.678/0001-99');
    expect(texto(res.body.termsHtml)).toContain('Rua das Flores, 100');
    expect(texto(res.body.termsHtml)).toContain('Salvador/BA');
  });

  it('nunca publica o CPF do lojista pessoa física', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        sellerDocType: SellerDocType.CPF,
        sellerDocument: '39053344705',
        sellerLegalName: 'Maria da Silva',
      },
    });

    const res = await publica(seed.store.slug).expect(200);
    expect(texto(res.body.termsHtml)).toContain('Maria da Silva');
    expect(texto(res.body.termsHtml)).not.toContain('39053344705');
    expect(texto(res.body.termsHtml)).not.toContain('390.533.447-05');
    expect(texto(res.body.privacyHtml)).not.toContain('39053344705');
  });

  it('texto escrito pelo lojista substitui o padrão', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { termsHtml: '<p>Minhas condições próprias.</p>' },
    });

    const res = await publica(seed.store.slug).expect(200);
    expect(texto(res.body.termsHtml)).toContain('Minhas condições próprias');
    expect(texto(res.body.termsHtml)).not.toContain('artigo 49');
    // as outras seguem no padrão
    expect(texto(res.body.returnsHtml)).toContain('7 dias');
  });

  it('HTML vazio ou só com marcação cai no padrão', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: { termsHtml: '<p></p><p><br /></p>', privacyHtml: '   ' },
    });

    const res = await publica(seed.store.slug).expect(200);
    expect(texto(res.body.termsHtml)).toContain('artigo 49');
    expect(texto(res.body.privacyHtml)).toContain('LGPD');
  });

  it('script no texto do lojista continua sendo removido', async () => {
    const seed = await seedStore(prisma);
    await prisma.store.update({
      where: { id: seed.store.id },
      data: {
        termsHtml: '<p>Oi</p><script>alert(document.cookie)</script>',
      },
    });

    const res = await publica(seed.store.slug).expect(200);
    expect(texto(res.body.termsHtml)).toContain('Oi');
    expect(texto(res.body.termsHtml)).not.toContain('<script');
    expect(texto(res.body.termsHtml)).not.toContain('alert(');
  });
});
