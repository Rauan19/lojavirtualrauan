import { gtinValido, montarFeed, textoPuro, type ProdutoFeed } from './feed';

const loja = { nome: 'Loja da Ana', baseUrl: 'https://lojadaana.com.br' };

const produto = (extra: Partial<ProdutoFeed> = {}): ProdutoFeed => ({
  id: 'p1',
  slug: 'camiseta-preta',
  name: 'Camiseta Preta',
  description: '<p>Algodão <b>100%</b></p>',
  sku: 'VD2AB3CD',
  brand: null,
  price: 89.9,
  compareAt: null,
  stock: 3,
  categoria: 'Roupas',
  imagens: ['https://img/1.webp', 'https://img/2.webp'],
  variantes: [],
  ...extra,
});

describe('feed do Google/Meta', () => {
  it('produto simples com os campos obrigatórios', () => {
    const x = montarFeed(loja, [produto()]);
    expect(x).toContain('<g:id>VD2AB3CD</g:id>');
    expect(x).toContain(
      '<g:link>https://lojadaana.com.br/p/camiseta-preta</g:link>',
    );
    expect(x).toContain('<g:price>89.90 BRL</g:price>');
    expect(x).toContain('<g:availability>in_stock</g:availability>');
    expect(x).toContain('<g:brand>Loja da Ana</g:brand>');
    expect(x).toContain('<g:description>Algodão 100%</g:description>');
    expect(x).toContain(
      '<g:additional_image_link>https://img/2.webp</g:additional_image_link>',
    );
  });

  it('promoção: preço cheio em price e o promocional em sale_price', () => {
    const x = montarFeed(loja, [produto({ price: 79.9, compareAt: 99.9 })]);
    expect(x).toContain('<g:price>99.90 BRL</g:price>');
    expect(x).toContain('<g:sale_price>79.90 BRL</g:sale_price>');
  });

  it('variações viram itens agrupados, com estoque e GTIN de cada uma', () => {
    const x = montarFeed(loja, [
      produto({
        variantes: [
          {
            id: 'v1',
            sku: 'VDP-M',
            barcode: '7891234567895',
            label: 'M',
            price: null,
            compareAt: null,
            stock: 0,
            imageUrl: null,
          },
          {
            id: 'v2',
            sku: 'VDP-G',
            barcode: null,
            label: 'G',
            price: 95,
            compareAt: null,
            stock: 2,
            imageUrl: null,
          },
        ],
      }),
    ]);
    expect(x.match(/<item>/g)).toHaveLength(2);
    expect(x).toContain('<g:item_group_id>VD2AB3CD</g:item_group_id>');
    expect(x).toContain('<g:title>Camiseta Preta - M</g:title>');
    expect(x).toContain('<g:gtin>7891234567895</g:gtin>');
    expect(x).toContain('<g:availability>out_of_stock</g:availability>');
    expect(x).toContain('<g:price>95.00 BRL</g:price>');
  });

  it('sem foto não entra (o Google recusa)', () => {
    const x = montarFeed(loja, [produto({ imagens: [] })]);
    expect(x).not.toContain('<item>');
  });

  it('escapa caracteres do XML', () => {
    const x = montarFeed(loja, [produto({ name: 'Copo <Tom & Jerry>' })]);
    expect(x).toContain('Copo &lt;Tom &amp; Jerry&gt;');
  });

  it('GTIN só com 8, 12, 13 ou 14 dígitos', () => {
    expect(gtinValido('789-1234567895')).toBe('7891234567895');
    expect(gtinValido('12345')).toBeNull();
  });

  it('descrição sem HTML', () => {
    expect(textoPuro('<p>Linha 1</p><p>Linha&nbsp;2</p>')).toBe(
      'Linha 1\nLinha 2',
    );
  });
});
