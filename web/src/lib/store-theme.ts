/*
 * Aparência da vitrine. A API já resolve qual chave vale para cada loja
 * (escolha do lojista ou preset do ramo); aqui só traduzimos a chave para
 * CSS. Os rótulos são os mesmos exibidos no admin, para o lojista escolher
 * pelo resultado e não pelo nome técnico da fonte.
 */

export type StoreFontKey =
  'padrao' | 'moderna' | 'amigavel' | 'elegante' | 'impacto';
export type StoreCardRatioKey = 'retrato' | 'quadrado' | 'alto';

type FontOption = {
  key: StoreFontKey;
  label: string;
  hint: string;
  /** Corpo do texto. */
  body: string;
  /** Títulos e nome da loja — quando difere do corpo. */
  display: string;
};

const FALLBACK = 'system-ui, sans-serif';

export const STORE_FONTS: FontOption[] = [
  {
    key: 'padrao',
    label: 'Padrão',
    hint: 'Neutra, funciona com qualquer produto',
    body: `var(--font-display), ${FALLBACK}`,
    display: `var(--font-display), ${FALLBACK}`,
  },
  {
    key: 'moderna',
    label: 'Moderna',
    hint: 'Limpa e técnica — eletrônicos, acessórios',
    body: `var(--font-store-modern), ${FALLBACK}`,
    display: `var(--font-store-modern), ${FALLBACK}`,
  },
  {
    key: 'amigavel',
    label: 'Amigável',
    hint: 'Arredondada e próxima — varejo popular',
    body: `var(--font-store-friendly), ${FALLBACK}`,
    display: `var(--font-store-friendly), ${FALLBACK}`,
  },
  {
    key: 'elegante',
    label: 'Elegante',
    hint: 'Títulos com serifa — moda, joias, presentes',
    body: `var(--font-store-modern), ${FALLBACK}`,
    display: `var(--font-store-elegant), Georgia, serif`,
  },
  {
    key: 'impacto',
    label: 'Impacto',
    hint: 'Títulos pesados e condensados — streetwear, suplementos',
    body: `var(--font-store-modern), ${FALLBACK}`,
    display: `var(--font-store-impact), Impact, ${FALLBACK}`,
  },
];

type RatioOption = {
  key: StoreCardRatioKey;
  label: string;
  hint: string;
  value: string;
};

export const STORE_CARD_RATIOS: RatioOption[] = [
  {
    key: 'quadrado',
    label: 'Quadrado',
    hint: 'Produto centralizado — eletrônicos, acessórios, geral',
    value: '1 / 1',
  },
  {
    key: 'retrato',
    label: 'Retrato',
    hint: 'Foto em pé — roupas, calçados',
    value: '3 / 4',
  },
  {
    key: 'alto',
    label: 'Alto',
    hint: 'Foto de corpo inteiro — moda editorial',
    value: '2 / 3',
  },
];

export function fontStyle(key?: string | null) {
  const found = STORE_FONTS.find((f) => f.key === key) || STORE_FONTS[0];
  return { body: found.body, display: found.display };
}

export function cardRatioValue(key?: string | null) {
  const found =
    STORE_CARD_RATIOS.find((r) => r.key === key) ||
    STORE_CARD_RATIOS.find((r) => r.key === 'retrato')!;
  return found.value;
}

/*
 * Temas da vitrine. O visual de cada um mora no CSS (globals.css, blocos
 * [data-tema=...]): aqui ficam o nome, para quem serve e as cores da
 * miniatura que aparece no painel.
 */
export type StoreThemeKey = 'essencial' | 'boutique' | 'tech' | 'street';

export type StoreThemeOption = {
  key: StoreThemeKey;
  nome: string;
  paraQuem: string;
  descricao: string;
  /** Miniatura no painel: fundo, cartão, texto e se o título é serifado */
  mini: {
    fundo: string;
    cartao: string;
    texto: string;
    titulo: 'serif' | 'sans' | 'impacto';
  };
};

export const STORE_THEMES: StoreThemeOption[] = [
  {
    key: 'essencial',
    nome: 'Essencial',
    paraQuem: 'Variedades, perfumaria, loja geral',
    descricao:
      'Limpo e direto: busca em destaque, categorias com foto e cartões leves.',
    mini: {
      fundo: '#ffffff',
      cartao: '#f1f2f4',
      texto: '#171a1f',
      titulo: 'sans',
    },
  },
  {
    key: 'boutique',
    nome: 'Boutique',
    paraQuem: 'Moda, acessórios, beleza, joias',
    descricao:
      'Editorial: banner em tela cheia, títulos com serifa, fotos grandes em pé e muito respiro.',
    mini: {
      fundo: '#fbf8f4',
      cartao: '#efe9e2',
      texto: '#1c1917',
      titulo: 'serif',
    },
  },
  {
    key: 'tech',
    nome: 'Tech',
    paraQuem: 'Eletrônicos, celulares, games, informática',
    descricao:
      'Fundo escuro, cartões com contorno e preço em destaque, foto quadrada.',
    mini: {
      fundo: '#0b1016',
      cartao: '#151c26',
      texto: '#e8edf3',
      titulo: 'sans',
    },
  },
  {
    key: 'street',
    nome: 'Street',
    paraQuem: 'Streetwear, suplementos, fitness',
    descricao:
      'Forte: títulos pesados em caixa alta, faixa de avisos em preto e cantos retos.',
    mini: {
      fundo: '#ffffff',
      cartao: '#ececec',
      texto: '#0a0a0a',
      titulo: 'impacto',
    },
  },
];

export function resolveTheme(key?: string | null): StoreThemeKey {
  return (STORE_THEMES.find((t) => t.key === key)?.key ??
    'essencial') as StoreThemeKey;
}

/** Fonte e foto que cada tema sugere (igual à API), usado na prévia ?tema= */
export const THEME_LAYOUT: Partial<
  Record<StoreThemeKey, { font: StoreFontKey; cardRatio: StoreCardRatioKey }>
> = {
  boutique: { font: 'elegante', cardRatio: 'alto' },
  tech: { font: 'moderna', cardRatio: 'quadrado' },
  street: { font: 'impacto', cardRatio: 'quadrado' },
};
