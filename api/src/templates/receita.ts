/*
 * Receita de um template da vitrine. Template não é código: é esta
 * combinação de escolhas, guardada no banco (tabela Template). A vitrine lê
 * a receita e um CSS genérico aplica cada escolha. O Super Admin cria e
 * edita templates sem deploy, e 200 templates custam o mesmo que 4.
 *
 * Os templates que vêm com a plataforma estão em
 * prisma/templates-iniciais.json e entram no banco pela migration.
 */
import type { StoreCardRatioKey, StoreFontKey } from '../stores/store-type';

export type TemplateReceita = {
  /** Cores da vitrine */
  fundo: string;
  superficie: string;
  texto: string;
  textoSuave: string;
  linha: string;
  corCartao: string;
  escuro: boolean;
  /** Faixa de avisos do topo */
  faixa: 'loja' | 'preta' | 'destaque';
  banner: 'caixa' | 'cheio';
  cartao: 'simples' | 'contorno' | 'preenchido';
  cantos: 'retos' | 'suaves' | 'redondos';
  tituloCaixa: 'normal' | 'alta';
  tituloPeso: 400 | 500 | 600 | 700 | 800;
  tituloAlinhamento: 'esquerda' | 'centro';
  nomeProduto: 'normal' | 'caixa-alta';
  precoNaCor: boolean;
  precoFonteTitulo: boolean;
  /** null = segue o ramo da loja */
  fonte: StoreFontKey | null;
  foto: StoreCardRatioKey | null;
  colunas: 3 | 4 | 5 | 6;
  compraRapida: 'passar-mouse' | 'sempre';
};

/** Receita padrão: vale para campo faltando e para loja sem template */
export const RECEITA_BASE: TemplateReceita = {
  fundo: '#ffffff',
  superficie: '#ffffff',
  texto: '#171a1f',
  textoSuave: '#4a5560',
  linha: '#d9dde3',
  corCartao: '#ffffff',
  escuro: false,
  faixa: 'loja',
  banner: 'caixa',
  cartao: 'simples',
  cantos: 'suaves',
  tituloCaixa: 'normal',
  tituloPeso: 600,
  tituloAlinhamento: 'esquerda',
  nomeProduto: 'normal',
  precoNaCor: false,
  precoFonteTitulo: false,
  fonte: null,
  foto: null,
  colunas: 6,
  compraRapida: 'passar-mouse',
};

const FONTES = ['padrao', 'moderna', 'amigavel', 'elegante', 'impacto'];
const FOTOS = ['retrato', 'quadrado', 'alto', 'paisagem'];
const COR = /^#[0-9a-f]{6}$/i;

function opcao<T extends string | number>(
  v: unknown,
  validas: readonly T[],
  padrao: T,
): T {
  return validas.includes(v as T) ? (v as T) : padrao;
}

/**
 * Lê qualquer coisa vinda do banco ou do formulário e devolve uma receita
 * completa e válida: campo faltando ou estranho cai no padrão. A vitrine
 * nunca recebe cor ou opção inventada (o valor vira CSS).
 */
export function normalizarReceita(entrada: unknown): TemplateReceita {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<
    string,
    unknown
  >;
  const cor = (k: keyof TemplateReceita) =>
    typeof e[k] === 'string' && COR.test(e[k])
      ? e[k].toLowerCase()
      : (RECEITA_BASE[k] as string);
  return {
    fundo: cor('fundo'),
    superficie: cor('superficie'),
    texto: cor('texto'),
    textoSuave: cor('textoSuave'),
    linha: cor('linha'),
    corCartao: cor('corCartao'),
    escuro: e.escuro === true,
    faixa: opcao(
      e.faixa,
      ['loja', 'preta', 'destaque'] as const,
      RECEITA_BASE.faixa,
    ),
    banner: opcao(e.banner, ['caixa', 'cheio'] as const, RECEITA_BASE.banner),
    cartao: opcao(
      e.cartao,
      ['simples', 'contorno', 'preenchido'] as const,
      RECEITA_BASE.cartao,
    ),
    cantos: opcao(
      e.cantos,
      ['retos', 'suaves', 'redondos'] as const,
      RECEITA_BASE.cantos,
    ),
    tituloCaixa: opcao(
      e.tituloCaixa,
      ['normal', 'alta'] as const,
      RECEITA_BASE.tituloCaixa,
    ),
    tituloPeso: opcao(
      e.tituloPeso,
      [400, 500, 600, 700, 800] as const,
      RECEITA_BASE.tituloPeso,
    ),
    tituloAlinhamento: opcao(
      e.tituloAlinhamento,
      ['esquerda', 'centro'] as const,
      RECEITA_BASE.tituloAlinhamento,
    ),
    nomeProduto: opcao(
      e.nomeProduto,
      ['normal', 'caixa-alta'] as const,
      RECEITA_BASE.nomeProduto,
    ),
    precoNaCor: e.precoNaCor === true,
    precoFonteTitulo: e.precoFonteTitulo === true,
    fonte: FONTES.includes(e.fonte as string)
      ? (e.fonte as StoreFontKey)
      : null,
    foto: FOTOS.includes(e.foto as string)
      ? (e.foto as StoreCardRatioKey)
      : null,
    colunas: opcao(e.colunas, [3, 4, 5, 6] as const, RECEITA_BASE.colunas),
    compraRapida: opcao(
      e.compraRapida,
      ['passar-mouse', 'sempre'] as const,
      RECEITA_BASE.compraRapida,
    ),
  };
}
