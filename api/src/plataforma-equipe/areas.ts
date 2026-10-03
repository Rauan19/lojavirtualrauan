import { caminhoDaRota } from '../equipe/areas';

/**
 * Áreas do Super Admin que o dono da plataforma libera para um colaborador,
 * e a área de cada rota. Mesma ideia de src/equipe/areas.ts (equipe da loja).
 *
 * Seguro por padrão: rota que não está na lista é só do dono. Isso inclui o
 * Mercado Pago da plataforma, a própria equipe e todas as rotas de painel de
 * loja (/admin/*, /stores/me/*) que o Super Admin também alcança.
 */
export const AREAS_PLATAFORMA = {
  lojas: 'Lojas: ver, editar, criar, suspender e reativar',
  planos: 'Planos e cobrança: planos, preços, teste grátis e mensalidades',
  comissoes: 'Comissões: relatório do split e taxa de cada loja',
  templates: 'Templates: criar, editar, ativar e dar cortesia',
} as const;

export type AreaPlataforma = keyof typeof AREAS_PLATAFORMA;

export function areaPlataformaValida(a: string): a is AreaPlataforma {
  return Object.prototype.hasOwnProperty.call(AREAS_PLATAFORMA, a);
}

type Acesso = 'livre' | 'dono' | AreaPlataforma[];

const REGRAS: [RegExp, Acesso, string?][] = [
  // Login, "quem sou eu", troca de senha e a própria verificação em 2 etapas
  [/^\/auth(\/|$)/, 'livre'],

  // Lojas: lista, ficha, edição, criação e status. Não pega /stores/me,
  // /stores/signup, /stores/public nem /stores/billing.
  [/^\/stores$/, ['lojas']],
  [
    /^\/stores\/(?!me$|me\/|signup$|public\/|billing$)[^/]+(\/status)?$/,
    ['lojas'],
  ],

  // A lista de planos é lida também pela ficha da loja (trocar plano) e pelo
  // editor de templates (template incluído em plano): só leitura
  [/^\/billing\/platform\/plans$/, ['planos', 'lojas', 'templates'], 'GET'],
  // Planos e cobrança (o resumo de mensalidades também mostra o MRR)
  [/^\/billing\/platform\/(plans|general)(\/|$)/, ['planos']],
  [/^\/stores\/billing$/, ['planos']],

  // Comissões do split
  [/^\/platform-fee\/(relatorio|relatorio\.csv)$/, ['comissoes']],
  [/^\/platform-fee\/(lojas|divergencias)\//, ['comissoes']],

  // Templates prontos da vitrine
  [/^\/super\/templates(\/|$)/, ['templates']],
];

function acessoDaRota(metodo: string, url: string): Acesso {
  const caminho = caminhoDaRota(url);
  const m = metodo.toUpperCase();
  for (const [re, acesso, soMetodo] of REGRAS) {
    if (soMetodo && soMetodo !== m) continue;
    if (re.test(caminho)) return acesso;
  }
  return 'dono';
}

/** O colaborador do Super Admin com estas áreas pode usar esta rota? */
export function colaboradorPode(
  permissoes: readonly string[],
  metodo: string,
  url: string,
): boolean {
  const acesso = acessoDaRota(metodo, url);
  if (acesso === 'livre') return true;
  if (acesso === 'dono') return false;
  return acesso.some((a) => permissoes.includes(a));
}
