/**
 * Feed de produtos no formato do Google Merchant Center (RSS 2.0 com o
 * namespace g:). O Meta (Facebook/Instagram Shopping) lê o mesmo arquivo.
 *
 * Regras do Google que importam:
 * - o preço tem que ser o mesmo da página (promoção já grava no preço);
 * - "de/por": `g:price` é o preço cheio e `g:sale_price` o promocional;
 * - variação vira um item próprio, ligado ao produto por `g:item_group_id`;
 * - sem GTIN válido, `g:identifier_exists` = no.
 */

export type ProdutoFeed = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sku: string | null;
  brand: string | null;
  price: number;
  compareAt: number | null;
  stock: number;
  categoria: string | null;
  imagens: string[];
  variantes: {
    id: string;
    sku: string | null;
    barcode: string | null;
    label: string;
    price: number | null;
    compareAt: number | null;
    stock: number;
    imageUrl: string | null;
  }[];
};

export type LojaFeed = {
  nome: string;
  /** Endereço da vitrine, sem barra no fim (domínio próprio ou /loja/slug) */
  baseUrl: string;
};

function xml(texto: string): string {
  return (
    texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // caracteres de controle quebram o XML
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

/** Descrição em texto puro (o Google recusa HTML), até 5.000 caracteres. */
export function textoPuro(html: string | null | undefined, max = 5000): string {
  const t = (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function preco(v: number) {
  return `${v.toFixed(2)} BRL`;
}

/** GTIN/EAN aceito pelo Google: 8, 12, 13 ou 14 dígitos. */
export function gtinValido(codigo: string | null | undefined): string | null {
  const d = (codigo || '').replace(/\D/g, '');
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

function item(campos: [string, string | null | undefined][]): string {
  const linhas = campos
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `      <${k}>${xml(String(v))}</${k}>`);
  return `    <item>\n${linhas.join('\n')}\n    </item>`;
}

export function montarFeed(loja: LojaFeed, produtos: ProdutoFeed[]): string {
  const itens: string[] = [];

  for (const p of produtos) {
    const link = `${loja.baseUrl}/p/${encodeURIComponent(p.slug)}`;
    const descricao = textoPuro(p.description) || p.name;
    const [imagem, ...extras] = p.imagens;
    if (!imagem) continue; // o Google recusa item sem foto

    const comuns = (
      precoCheio: number,
      compare: number | null,
    ): [string, string][] => {
      const promo = compare != null && compare > precoCheio;
      return [
        ['g:price', preco(promo ? compare : precoCheio)],
        ...(promo
          ? [['g:sale_price', preco(precoCheio)] as [string, string]]
          : []),
      ];
    };

    const marca = p.brand?.trim() || loja.nome;
    const ativas = p.variantes;

    if (ativas.length === 0) {
      itens.push(
        item([
          ['g:id', p.sku || p.id],
          ['g:title', p.name.slice(0, 150)],
          ['g:description', descricao],
          ['g:link', link],
          ['g:image_link', imagem],
          ...extras
            .slice(0, 10)
            .map((u) => ['g:additional_image_link', u] as [string, string]),
          ['g:availability', p.stock > 0 ? 'in_stock' : 'out_of_stock'],
          ...comuns(p.price, p.compareAt),
          ['g:brand', marca],
          ['g:condition', 'new'],
          ['g:identifier_exists', 'no'],
          ['g:product_type', p.categoria],
        ]),
      );
      continue;
    }

    for (const v of ativas) {
      const gtin = gtinValido(v.barcode);
      itens.push(
        item([
          ['g:id', v.sku || v.id],
          ['g:item_group_id', p.sku || p.id],
          ['g:title', `${p.name} - ${v.label}`.slice(0, 150)],
          ['g:description', descricao],
          ['g:link', `${link}?variante=${encodeURIComponent(v.id)}`],
          ['g:image_link', v.imageUrl || imagem],
          ...extras
            .slice(0, 10)
            .map((u) => ['g:additional_image_link', u] as [string, string]),
          ['g:availability', v.stock > 0 ? 'in_stock' : 'out_of_stock'],
          ...comuns(v.price ?? p.price, v.compareAt ?? p.compareAt),
          ['g:brand', marca],
          ['g:condition', 'new'],
          ...(gtin
            ? [['g:gtin', gtin] as [string, string]]
            : [['g:identifier_exists', 'no'] as [string, string]]),
          ['g:product_type', p.categoria],
        ]),
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(loja.nome)}</title>
    <link>${xml(loja.baseUrl)}</link>
    <description>${xml(`Produtos de ${loja.nome}`)}</description>
${itens.join('\n')}
  </channel>
</rss>
`;
}
