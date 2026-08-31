/*
 * Aparência da vitrine. A API já resolve qual chave vale para cada loja
 * (escolha do lojista ou preset do ramo); aqui só traduzimos a chave para
 * CSS. Os rótulos são os mesmos exibidos no admin, para o lojista escolher
 * pelo resultado e não pelo nome técnico da fonte.
 */

export type StoreFontKey = 'padrao' | 'moderna' | 'amigavel' | 'elegante';
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
