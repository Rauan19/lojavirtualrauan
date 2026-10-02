/*
 * Templates prontos da vitrine. O template é dado (tabela Template na API),
 * não código: a vitrine recebe a receita e esta função a transforma em
 * variáveis CSS e atributos data-*, que o CSS genérico de globals.css lê
 * (bloco "Templates da vitrine"). Mesma receita que api/src/templates/receita.ts.
 */
import type { CSSProperties } from 'react';
import type { StoreCardRatioKey, StoreFontKey } from '@/lib/store-theme';

export type TemplateReceita = {
  fundo: string;
  superficie: string;
  texto: string;
  textoSuave: string;
  linha: string;
  corCartao: string;
  escuro: boolean;
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
  fonte: StoreFontKey | null;
  foto: StoreCardRatioKey | null;
  colunas: 3 | 4 | 5 | 6;
  compraRapida: 'passar-mouse' | 'sempre';
};

export type TemplateDaLoja = { chave: string; receita: TemplateReceita };

export type Acesso = 'gratis' | 'plano' | 'pago';

export type Liberacao =
  | { liberado: true; por: 'gratis' | 'plano' | 'teste' | 'compra' }
  | { liberado: false; precisa: 'plano' | 'compra' };

/** Item da galeria (painel do lojista e Super Admin) */
export type TemplateItem = {
  chave: string;
  nome: string;
  paraQuem: string;
  descricao: string;
  segmentos: string[];
  receita: TemplateReceita;
  acesso?: Acesso;
  planos?: string[];
  precoCentavos?: number | null;
  liberacao?: Liberacao;
};

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

export const SEGMENTOS: { key: string; label: string }[] = [
  { key: 'geral', label: 'Loja geral' },
  { key: 'moda', label: 'Moda' },
  { key: 'beleza', label: 'Beleza e joias' },
  { key: 'eletronicos', label: 'Eletrônicos' },
  { key: 'esporte', label: 'Esporte' },
  { key: 'alimentos', label: 'Alimentos' },
  { key: 'casa', label: 'Casa' },
  { key: 'pet', label: 'Pet' },
  { key: 'infantil', label: 'Infantil' },
  { key: 'livros', label: 'Livros' },
  { key: 'atacado', label: 'Atacado' },
];

/** Raio de foto, botão e selo para cada escolha de cantos */
const RAIOS = {
  retos: { foto: '0px', botao: '0px', cartao: '0px' },
  suaves: { foto: '14px', botao: '10px', cartao: '14px' },
  redondos: { foto: '22px', botao: '999px', cartao: '22px' },
} as const;

/** Variáveis e atributos que a vitrine põe no elemento raiz */
export function aplicarTemplate(r: TemplateReceita) {
  const raio = RAIOS[r.cantos];
  const style = {
    '--t-fundo': r.fundo,
    '--t-superficie': r.superficie,
    '--t-cartao': r.corCartao,
    '--t-raio-foto': raio.foto,
    '--t-raio-botao': raio.botao,
    '--t-raio-cartao': raio.cartao,
    '--t-titulo-peso': String(r.tituloPeso),
    '--t-colunas': String(r.colunas),
    // Cores de texto do resto do site seguem o template
    '--ink': r.texto,
    '--muted': r.textoSuave,
    '--line': r.linha,
  } as CSSProperties;
  const attrs = {
    'data-escuro': r.escuro ? 'sim' : 'nao',
    'data-faixa': r.faixa,
    'data-banner': r.banner,
    'data-cartao': r.cartao,
    'data-titulo-caixa': r.tituloCaixa,
    'data-titulo-alinhamento': r.tituloAlinhamento,
    'data-nome-produto': r.nomeProduto,
    'data-preco-cor': r.precoNaCor ? 'sim' : 'nao',
    'data-preco-titulo': r.precoFonteTitulo ? 'sim' : 'nao',
    'data-compra': r.compraRapida,
  };
  return { style, attrs };
}

export function precoTexto(centavos?: number | null) {
  if (centavos == null) return '';
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
