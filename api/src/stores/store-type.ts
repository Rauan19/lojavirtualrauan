import { StoreType } from '@prisma/client';

export type AttributeDef = {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options?: string[];
  filterable?: boolean;
  required?: boolean;
};

export type VariantAxis = {
  key: string;
  label: string;
  options: string[];
};

/**
 * Aparência que a vitrine assume quando o lojista não escolheu nada. Moda
 * pede foto vertical de corpo inteiro; eletrônico e calçado pedem quadrado
 * com o produto centralizado. É essa diferença que faz duas lojas com a
 * mesma estrutura não parecerem a mesma loja.
 */
export type StoreLayoutPreset = {
  font: StoreFontKey;
  cardRatio: StoreCardRatioKey;
};

export const STORE_FONT_KEYS = ['padrao', 'moderna', 'amigavel', 'elegante'] as const;
export type StoreFontKey = (typeof STORE_FONT_KEYS)[number];

export const STORE_CARD_RATIO_KEYS = ['retrato', 'quadrado', 'alto'] as const;
export type StoreCardRatioKey = (typeof STORE_CARD_RATIO_KEYS)[number];

export type StoreTypeConfig = {
  type: StoreType;
  label: string;
  description: string;
  categories: { name: string; slug: string }[];
  attributes: AttributeDef[];
  variantAxes: VariantAxis[];
  layout: StoreLayoutPreset;
};

export const STORE_TYPE_CONFIGS: Record<StoreType, StoreTypeConfig> = {
  FASHION: {
    type: 'FASHION',
    label: 'Moda / Roupas',
    description: 'Camisetas, calças, vestidos — com tamanho e cor',
    categories: [
      { name: 'Novidades', slug: 'novidades' },
      { name: 'Masculino', slug: 'masculino' },
      { name: 'Feminino', slug: 'feminino' },
      { name: 'Infantil', slug: 'infantil' },
      { name: 'Acessórios', slug: 'acessorios' },
      { name: 'Promoções', slug: 'promocoes' },
    ],
    attributes: [
      {
        key: 'material',
        label: 'Material / composição',
        type: 'text',
        filterable: true,
      },
      {
        key: 'gender',
        label: 'Gênero',
        type: 'select',
        options: ['Masculino', 'Feminino', 'Unissex', 'Infantil'],
        filterable: true,
      },
    ],
    variantAxes: [
      {
        key: 'size',
        label: 'Tamanho',
        options: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'],
      },
      {
        key: 'color',
        label: 'Cor',
        options: [
          'Preto',
          'Branco',
          'Cinza',
          'Azul',
          'Vermelho',
          'Verde',
          'Bege',
          'Rosa',
          'Amarelo',
          'Marrom',
        ],
      },
    ],
    layout: { font: 'elegante', cardRatio: 'retrato' },
  },
  SHOES: {
    type: 'SHOES',
    label: 'Calçados',
    description: 'Tênis, sandálias, botas — numeração',
    categories: [
      { name: 'Novidades', slug: 'novidades' },
      { name: 'Masculino', slug: 'masculino' },
      { name: 'Feminino', slug: 'feminino' },
      { name: 'Infantil', slug: 'infantil' },
      { name: 'Promoções', slug: 'promocoes' },
    ],
    attributes: [
      {
        key: 'material',
        label: 'Material',
        type: 'text',
        filterable: true,
      },
    ],
    variantAxes: [
      {
        key: 'size',
        label: 'Numeração',
        options: [
          '33',
          '34',
          '35',
          '36',
          '37',
          '38',
          '39',
          '40',
          '41',
          '42',
          '43',
          '44',
          '45',
        ],
      },
      {
        key: 'color',
        label: 'Cor',
        options: ['Preto', 'Branco', 'Marrom', 'Bege', 'Azul', 'Cinza'],
      },
    ],
    layout: { font: 'moderna', cardRatio: 'quadrado' },
  },
  ELECTRONICS: {
    type: 'ELECTRONICS',
    label: 'Eletrônicos / Som',
    description: 'Áudio, cabos, caixas, periféricos',
    categories: [
      { name: 'Novidades', slug: 'novidades' },
      { name: 'Áudio', slug: 'audio' },
      { name: 'Cabos e conectores', slug: 'cabos' },
      { name: 'Acessórios', slug: 'acessorios' },
      { name: 'Promoções', slug: 'promocoes' },
    ],
    attributes: [
      {
        key: 'voltage',
        label: 'Voltagem',
        type: 'select',
        options: ['110V', '220V', 'Bivolt', 'N/A'],
        filterable: true,
      },
      {
        key: 'power',
        label: 'Potência',
        type: 'text',
        filterable: true,
      },
      {
        key: 'impedance',
        label: 'Impedância (ohms)',
        type: 'text',
      },
      {
        key: 'warranty',
        label: 'Garantia',
        type: 'select',
        options: ['3 meses', '6 meses', '12 meses', '24 meses'],
      },
      { key: 'model', label: 'Modelo', type: 'text', filterable: true },
    ],
    variantAxes: [
      {
        key: 'color',
        label: 'Cor / acabamento',
        options: ['Preto', 'Prata', 'Branco', 'Único'],
      },
    ],
    layout: { font: 'moderna', cardRatio: 'quadrado' },
  },
  GENERAL: {
    type: 'GENERAL',
    label: 'Geral / outros',
    description: 'Qualquer produto — atributos livres',
    categories: [
      { name: 'Novidades', slug: 'novidades' },
      { name: 'Destaques', slug: 'destaques' },
      { name: 'Promoções', slug: 'promocoes' },
    ],
    attributes: [
      { key: 'brand', label: 'Marca', type: 'text', filterable: true },
      { key: 'model', label: 'Modelo', type: 'text' },
      {
        key: 'condition',
        label: 'Condição',
        type: 'select',
        options: ['Novo', 'Usado', 'Recondicionado'],
        filterable: true,
      },
    ],
    variantAxes: [],
    layout: { font: 'padrao', cardRatio: 'quadrado' },
  },
  CUSTOM: {
    type: 'CUSTOM',
    label: 'Personalizado',
    description: 'Você define atributos e variações',
    categories: [
      { name: 'Novidades', slug: 'novidades' },
      { name: 'Catálogo', slug: 'catalogo' },
      { name: 'Promoções', slug: 'promocoes' },
    ],
    attributes: [],
    variantAxes: [],
    layout: { font: 'padrao', cardRatio: 'retrato' },
  },
};

/**
 * Aparência final da vitrine: o que o lojista escolheu vence; o que ele
 * deixou em branco cai no preset do ramo da loja.
 */
export function resolveStoreLayout(
  type: StoreType,
  font?: string | null,
  cardRatio?: string | null,
): StoreLayoutPreset {
  const preset =
    STORE_TYPE_CONFIGS[type]?.layout ?? STORE_TYPE_CONFIGS.GENERAL.layout;
  return {
    font: STORE_FONT_KEYS.includes(font as StoreFontKey)
      ? (font as StoreFontKey)
      : preset.font,
    cardRatio: STORE_CARD_RATIO_KEYS.includes(cardRatio as StoreCardRatioKey)
      ? (cardRatio as StoreCardRatioKey)
      : preset.cardRatio,
  };
}

export function categoriesForStoreType(type: StoreType) {
  return (
    STORE_TYPE_CONFIGS[type]?.categories ??
    STORE_TYPE_CONFIGS.GENERAL.categories
  );
}

export function onlyDigits(value?: string | null) {
  return (value || '').replace(/\D/g, '');
}

/** Validação simples de CPF (dígitos + DV). */
export function isValidCpf(raw: string) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/** Validação simples de CNPJ (dígitos + DV). */
export function isValidCnpj(raw: string) {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, factors: number[]) => {
    const sum = factors.reduce((acc, f, i) => acc + Number(base[i]) * f, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}
