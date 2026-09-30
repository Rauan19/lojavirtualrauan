import { PlatformFeeEntryType } from '@prisma/client';
import { paraCentavos } from './calculo';

/** O que o livro precisa saber de um pagamento do Mercado Pago. */
export type PagamentoMp = {
  id: number | string;
  status: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  fee_details?: { type?: string; amount?: number }[];
  refunds?: { id?: number | string; amount?: number; status?: string }[];
};

export type Lancamento = {
  type: PlatformFeeEntryType;
  amountCents: number;
  idempotencyKey: string;
  mpPaymentId: string;
  note?: string;
};

/** Status em que o dinheiro chegou a entrar (e a comissão foi retida). */
const JA_APROVADO = new Set([
  'approved',
  'refunded',
  'charged_back',
  'in_mediation',
]);

/** Comissão que o Mercado Pago de fato reteve neste pagamento, em centavos. */
export function comissaoRetida(p: PagamentoMp): number {
  return (p.fee_details ?? [])
    .filter((f) => f.type === 'application_fee')
    .reduce((soma, f) => soma + paraCentavos(f.amount), 0);
}

/**
 * Lançamentos que o livro deveria ter para este pagamento.
 *
 * Tudo sai do estado atual do pagamento no Mercado Pago, com chave de
 * idempotência fixa por fato (cobrança, cada estorno, chargeback). Rodar de
 * novo, fora de ordem ou duas vezes gera as mesmas chaves — o banco descarta
 * as repetidas. Nunca se apaga nem se edita um lançamento: correção é
 * lançamento novo.
 *
 * Estorno parcial devolve a comissão na mesma proporção (é o que o Mercado
 * Pago faz com a application_fee). O acumulado é arredondado uma vez só, para
 * a soma dos estornos nunca passar da comissão cobrada.
 *
 * `jaLancados` são as chaves que já estão no livro — usadas só para decidir o
 * ajuste de chargeback revertido.
 */
export function lancamentosEsperados(
  p: PagamentoMp,
  jaLancados: ReadonlySet<string> = new Set(),
): Lancamento[] {
  const mpPaymentId = String(p.id);
  const cobrada = comissaoRetida(p);
  if (cobrada <= 0 || !JA_APROVADO.has(p.status)) return [];

  const out: Lancamento[] = [
    {
      type: PlatformFeeEntryType.CHARGE,
      amountCents: cobrada,
      idempotencyKey: `charge:${mpPaymentId}`,
      mpPaymentId,
    },
  ];

  const totalCents = paraCentavos(p.transaction_amount);
  const estornos = (p.refunds ?? []).filter(
    (r) => r.id != null && r.status !== 'rejected' && r.status !== 'cancelled',
  );

  let estornadoCents = 0;
  let devolvidoCents = 0;
  for (const r of estornos) {
    estornadoCents += paraCentavos(r.amount);
    const acumulado =
      totalCents > 0
        ? Math.min(cobrada, Math.round((cobrada * estornadoCents) / totalCents))
        : cobrada;
    const parte = acumulado - devolvidoCents;
    devolvidoCents = acumulado;
    if (parte <= 0) continue;
    out.push({
      type: PlatformFeeEntryType.REFUND,
      amountCents: -parte,
      idempotencyKey: `refund:${mpPaymentId}:${r.id}`,
      mpPaymentId,
    });
  }

  // Reembolso total sem a lista de estornos (ou com arredondamento sobrando)
  if (p.status === 'refunded' && devolvidoCents < cobrada) {
    out.push({
      type: PlatformFeeEntryType.REFUND,
      amountCents: -(cobrada - devolvidoCents),
      idempotencyKey: `refund:${mpPaymentId}:saldo`,
      mpPaymentId,
    });
    devolvidoCents = cobrada;
  }

  const chaveChargeback = `chargeback:${mpPaymentId}`;
  const restante = cobrada - devolvidoCents;
  if (p.status === 'charged_back' && restante > 0) {
    out.push({
      type: PlatformFeeEntryType.CHARGEBACK,
      amountCents: -restante,
      idempotencyKey: chaveChargeback,
      mpPaymentId,
      note: 'Contestação no cartão: comissão considerada perdida até o Mercado Pago decidir',
    });
  } else if (
    p.status === 'approved' &&
    jaLancados.has(chaveChargeback) &&
    restante > 0
  ) {
    // A loja ganhou a contestação: o pagamento voltou a aprovado
    out.push({
      type: PlatformFeeEntryType.ADJUSTMENT,
      amountCents: restante,
      idempotencyKey: `chargeback-revertido:${mpPaymentId}`,
      mpPaymentId,
      note: 'Contestação revertida a favor da loja',
    });
  }

  return out;
}
