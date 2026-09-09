/**
 * Medidas de pacote compartilhadas pela cotação e pela compra da etiqueta.
 *
 * Elas viviam duplicadas e divergentes: os provedores de cotação caíam em
 * 0,5kg / 16×10×20 quando o produto não tinha medida cadastrada, e a etiqueta
 * caía em 0,3kg / 16×5×20. Produto sem medida era cotado com um pacote e
 * despachado com outro — e a diferença volta depois, cobrada do lojista pela
 * transportadora.
 */
export const DEFAULT_PACKAGE = {
  weight: 0.5,
  width: 16,
  height: 10,
  length: 20,
} as const;

/**
 * Modos de frete que cotam pela medida real do produto.
 *
 * Neles, peso e dimensões deixam de ser opcionais no cadastro: sem eles a
 * cotação e a etiqueta caem no DEFAULT_PACKAGE, o cliente paga um frete
 * estimado e a transportadora cobra a diferença do lojista depois. Em
 * "manual" e "grátis" a medida não é usada, então continua opcional.
 */
export const CARRIER_QUOTE_MODES = new Set([
  'melhor_envio',
  'frenet',
  'superfrete',
]);

export type PackageDimensions = {
  weight: number;
  width: number;
  height: number;
  length: number;
};

/*
 * `unknown` de proposito: as medidas chegam como Decimal do Prisma na
 * etiqueta e como number na cotacao. Converter aqui evita arrastar o tipo do
 * Prisma para dentro de um helper que e so aritmetica.
 */
export type PackableItem = {
  quantity: number;
  weight?: unknown;
  width?: unknown;
  height?: unknown;
  length?: unknown;
};

/** Decimal do Prisma, string ou number — só vale medida positiva. */
function positive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function round(value: number, places: number) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Medida de um item, com o mesmo piso e o mesmo fallback da cotação. */
export function itemPackage(item: PackableItem): PackageDimensions {
  return {
    weight: Math.max(0.1, positive(item.weight) ?? DEFAULT_PACKAGE.weight),
    width: Math.max(1, positive(item.width) ?? DEFAULT_PACKAGE.width),
    height: Math.max(1, positive(item.height) ?? DEFAULT_PACKAGE.height),
    length: Math.max(1, positive(item.length) ?? DEFAULT_PACKAGE.length),
  };
}

/**
 * Junta o pedido inteiro num volume só, empilhando os itens.
 *
 * A cotação manda os produtos com quantidade e deixa a transportadora cubar
 * tudo como UM envio — é esse preço que o cliente pagou no checkout. A
 * etiqueta declarava um volume por unidade, então um pedido de três itens
 * comprava três fretes, e a diferença saía do bolso do lojista.
 *
 * O empilhamento (peso somado, base na maior largura e maior comprimento,
 * altura somada) é a aproximação usual de "vai tudo numa caixa". Não é a
 * cubagem exata da transportadora, mas erra para cima, que é o lado seguro:
 * pacote declarado maior que o real não gera cobrança extra depois.
 */
export function consolidatePackage(items: PackableItem[]): PackageDimensions {
  const packed = items.map((item) => ({
    ...itemPackage(item),
    quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
  }));

  if (!packed.length) return { ...DEFAULT_PACKAGE };

  return {
    weight: Math.max(
      0.1,
      round(
        packed.reduce((sum, p) => sum + p.weight * p.quantity, 0),
        3,
      ),
    ),
    width: Math.max(1, ...packed.map((p) => p.width)),
    length: Math.max(1, ...packed.map((p) => p.length)),
    height: Math.max(
      1,
      round(
        packed.reduce((sum, p) => sum + p.height * p.quantity, 0),
        2,
      ),
    ),
  };
}
