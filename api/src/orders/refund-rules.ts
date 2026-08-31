/*
 * Regras de reembolso e devolução.
 *
 * O motivo do pedido de reembolso não é detalhe de formulário: ele decide se
 * o produto precisa voltar, quem paga o frete de volta e se o lojista tem o
 * direito de recusar.
 *
 * - Arrependimento (CDC art. 49): 7 dias corridos do recebimento, sem
 *   justificativa. Dentro do prazo o lojista NÃO pode recusar, e o frete de
 *   volta é dele.
 * - Defeito (CDC art. 18 e 26): 30 dias para bem não durável, 90 para
 *   durável. Exige devolução, e o lojista avalia.
 * - Não recebi: não há o que devolver. Também não pode devolver ao estoque —
 *   a peça se perdeu no caminho, não voltou para a prateleira.
 * - Outro: acordo entre as partes.
 */

export const REFUND_REASONS = [
  'ARREPENDIMENTO',
  'DEFEITO',
  'NAO_RECEBI',
  'OUTRO',
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUS = {
  REQUESTED: 'REQUESTED',
  /** Devolução autorizada, esperando o produto chegar de volta. */
  RETURN_PENDING: 'RETURN_PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

/** Prazo do direito de arrependimento, em dias corridos. */
export const PRAZO_ARREPENDIMENTO_DIAS = 7;

type Regra = {
  label: string;
  /** O produto precisa voltar antes de o dinheiro sair. */
  exigeDevolucao: boolean;
  /** O lojista pode recusar o pedido. */
  podeRecusar: boolean;
};

export const REGRAS: Record<RefundReason, Regra> = {
  ARREPENDIMENTO: {
    label: 'Desisti da compra',
    exigeDevolucao: true,
    // dentro dos 7 dias é direito, não pedido — ver podeRecusarPedido()
    podeRecusar: false,
  },
  DEFEITO: {
    label: 'Produto com defeito',
    exigeDevolucao: true,
    podeRecusar: true,
  },
  NAO_RECEBI: {
    label: 'Não recebi o produto',
    exigeDevolucao: false,
    podeRecusar: true,
  },
  OUTRO: { label: 'Outro motivo', exigeDevolucao: false, podeRecusar: true },
};

export function isRefundReason(value: unknown): value is RefundReason {
  return REFUND_REASONS.includes(value as RefundReason);
}

/**
 * Fim do prazo de arrependimento. Conta do recebimento; enquanto o pedido não
 * foi entregue o prazo nem começou, e o direito continua de pé.
 */
export function prazoArrependimento(deliveredAt: Date | null) {
  if (!deliveredAt) return null;
  return new Date(
    deliveredAt.getTime() + PRAZO_ARREPENDIMENTO_DIAS * 24 * 60 * 60 * 1000,
  );
}

export function dentroDoPrazoArrependimento(
  deliveredAt: Date | null,
  agora = new Date(),
) {
  const limite = prazoArrependimento(deliveredAt);
  // ainda não entregue: o prazo não começou a correr
  if (!limite) return true;
  return agora <= limite;
}

/**
 * O lojista pode recusar este pedido de reembolso? Arrependimento dentro do
 * prazo é direito do consumidor — recusar seria ilegal, então o sistema não
 * oferece o botão.
 */
export function podeRecusarPedido(
  reasonType: string | null,
  deliveredAt: Date | null,
  agora = new Date(),
) {
  if (reasonType === 'ARREPENDIMENTO') {
    return !dentroDoPrazoArrependimento(deliveredAt, agora);
  }
  if (!isRefundReason(reasonType)) return true;
  return REGRAS[reasonType].podeRecusar;
}

export function exigeDevolucao(reasonType: string | null) {
  if (!isRefundReason(reasonType)) return false;
  return REGRAS[reasonType].exigeDevolucao;
}

/**
 * O estoque volta para a prateleira?
 *
 * Só quando a peça de fato voltou, ou quando ela nunca chegou a sair (pedido
 * cancelado antes do envio). Em extravio o produto não retorna — devolver ao
 * estoque criaria peça fantasma, que a loja vende e não tem como entregar.
 */
export function deveDevolverEstoque(order: {
  returnReceivedAt: Date | null;
  shippedAt: Date | null;
  refundReasonType: string | null;
}) {
  if (order.returnReceivedAt) return true;
  if (order.refundReasonType === 'NAO_RECEBI') return false;
  return !order.shippedAt;
}
