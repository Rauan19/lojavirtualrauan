/*
 * Quem pode usar cada template. Três jeitos de oferecer:
 *  - gratis: qualquer loja;
 *  - plano: só lojas nos planos marcados (benefício de plano mais caro);
 *  - pago: venda única; a loja compra uma vez e o template fica dela. Um
 *    template pago também pode vir incluso em algum plano.
 *
 * No teste grátis a loja experimenta o que é de plano (igual aos outros
 * recursos), mas template pago continua pedindo compra.
 */
export const ACESSOS = ['gratis', 'plano', 'pago'] as const;
export type AcessoTemplate = (typeof ACESSOS)[number];

export type RegraTemplate = {
  chave: string;
  acesso: AcessoTemplate;
  /** ids dos planos (PlatformPlan) que incluem o template */
  planos: string[];
};

export type SituacaoLoja = {
  planName: string;
  emTeste: boolean;
  /** chaves dos templates que a loja comprou ou ganhou */
  compradas: ReadonlySet<string>;
};

export type Liberacao =
  | { liberado: true; por: 'gratis' | 'plano' | 'teste' | 'compra' }
  | { liberado: false; precisa: 'plano' | 'compra' };

export function liberacao(t: RegraTemplate, loja: SituacaoLoja): Liberacao {
  if (t.acesso === 'gratis') return { liberado: true, por: 'gratis' };
  if (loja.compradas.has(t.chave)) return { liberado: true, por: 'compra' };
  if (t.planos.includes(loja.planName)) return { liberado: true, por: 'plano' };
  if (t.acesso === 'plano') {
    return loja.emTeste
      ? { liberado: true, por: 'teste' }
      : { liberado: false, precisa: 'plano' };
  }
  return { liberado: false, precisa: 'compra' };
}
