import { StoreStatus } from '@prisma/client';

/*
 * Regras da mensalidade paga por Pix.
 *
 * Pix recorrente não existe: a API do Mercado Pago só faz débito automático
 * no cartão (preapproval). Para Pix, o ciclo é nosso — a cada mês geramos uma
 * cobrança avulsa nova e avisamos o lojista.
 *
 * A consequência prática, que a interface precisa deixar clara: no cartão o
 * dinheiro entra sozinho; no Pix o lojista precisa pagar todo mês, e quem
 * segura o inadimplente é a régua de suspensão.
 */

export const BILLING_METHOD = { CARD: 'CARD', PIX: 'PIX' } as const;
export type BillingMethod = (typeof BILLING_METHOD)[keyof typeof BILLING_METHOD];

/** Com quantos dias de antecedência a cobrança do próximo ciclo é criada. */
export const ANTECEDENCIA_DIAS = 5;

/**
 * Validade da cobrança Pix.
 *
 * Generosa de propósito: se expirar antes de o lojista pagar, ele volta ao
 * painel e encontra um QR morto. Com 10 dias, a cobrança cobre a antecedência
 * mais a carência de suspensão.
 */
export const VALIDADE_DIAS = 10;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Lojas que ainda vale cobrar automaticamente. */
const STATUS_COBRAVEL: StoreStatus[] = [
  StoreStatus.ACTIVE,
  StoreStatus.TRIAL,
  StoreStatus.PAST_DUE,
];

export type MotivoPular =
  | 'nao_e_pix'
  | 'status_nao_cobravel'
  | 'sem_vencimento'
  | 'ainda_cedo'
  | 'ja_tem_cobranca_aberta';

export type DecisaoCobranca =
  | { gerar: true }
  | { gerar: false; motivo: MotivoPular };

export type LojaParaCobranca = {
  billingMethod: string | null;
  status: StoreStatus;
  planDueAt: Date | null;
};

export type CobrancaAberta = {
  pixExpiresAt: Date | null;
} | null;

/**
 * Decide se é hora de gerar a cobrança Pix do próximo ciclo.
 *
 * Separado do serviço de propósito: é aqui que mora o risco de cobrar duas
 * vezes ou de esquecer de cobrar, e isso se testa sem banco e sem Mercado
 * Pago, com data controlada.
 */
export function decidirCobrancaPix({
  loja,
  cobrancaAberta,
  agora = new Date(),
}: {
  loja: LojaParaCobranca;
  cobrancaAberta: CobrancaAberta;
  agora?: Date;
}): DecisaoCobranca {
  if (loja.billingMethod !== BILLING_METHOD.PIX) {
    return { gerar: false, motivo: 'nao_e_pix' };
  }
  if (!STATUS_COBRAVEL.includes(loja.status)) {
    return { gerar: false, motivo: 'status_nao_cobravel' };
  }
  if (!loja.planDueAt) {
    return { gerar: false, motivo: 'sem_vencimento' };
  }

  /*
   * Cobrança pendente que ainda vale bloqueia uma nova — sem isso o lojista
   * receberia um QR novo por dia até pagar, e poderia pagar dois.
   * Já expirada não bloqueia: aí é hora de emitir outra.
   */
  if (cobrancaAberta) {
    const vencida =
      cobrancaAberta.pixExpiresAt != null &&
      cobrancaAberta.pixExpiresAt.getTime() <= agora.getTime();
    if (!vencida) {
      return { gerar: false, motivo: 'ja_tem_cobranca_aberta' };
    }
  }

  const janela = loja.planDueAt.getTime() - ANTECEDENCIA_DIAS * DIA_MS;
  if (agora.getTime() < janela) {
    return { gerar: false, motivo: 'ainda_cedo' };
  }

  return { gerar: true };
}

/**
 * Quantos dias depois do vencimento vale insistir por e-mail.
 *
 * Um lembrete só, no dia seguinte ao vencimento. Mandar todo dia até pagar
 * vira spam e treina o lojista a ignorar o remetente — justamente quem
 * precisa ler o aviso de suspensão depois.
 */
export const LEMBRETE_APOS_DIAS = 1;

export function deveLembrar({
  dueAt,
  lembreteEnviadoEm,
  agora = new Date(),
}: {
  dueAt: Date | null;
  lembreteEnviadoEm: Date | null;
  agora?: Date;
}) {
  if (!dueAt) return false;
  if (lembreteEnviadoEm) return false;
  return agora.getTime() >= dueAt.getTime() + LEMBRETE_APOS_DIAS * DIA_MS;
}

export function validadeDaCobranca(agora = new Date()) {
  return new Date(agora.getTime() + VALIDADE_DIAS * DIA_MS);
}

/**
 * Documento do lojista para o Pix. O Mercado Pago exige CPF ou CNPJ do
 * pagador na cobrança Pix — sem isso a API recusa, então vale checar antes
 * de montar a requisição e dar um erro que explique o que preencher.
 */
export function documentoDoPagador(
  docType: string | null,
  documento: string | null,
) {
  const numero = (documento || '').replace(/\D/g, '');
  if (!numero) return null;
  if (numero.length === 14) return { type: 'CNPJ', number: numero };
  if (numero.length === 11) return { type: 'CPF', number: numero };
  // tipo declarado sem número válido não serve para o gateway
  return docType && numero ? { type: docType, number: numero } : null;
}
