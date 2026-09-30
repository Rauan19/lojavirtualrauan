/**
 * Conta da comissão da plataforma. Tudo em centavos (inteiro): dinheiro em
 * ponto flutuante erra na casa dos centavos, e aqui cada centavo é de alguém.
 */

/** R$ (Decimal/número/texto) → centavos, arredondando no centavo. */
export function paraCentavos(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function paraReais(centavos: number): number {
  return centavos / 100;
}

export type Comissao = {
  bps: number;
  /** Produtos − desconto. Frete e juros do parcelamento ficam de fora. */
  baseCents: number;
  feeCents: number;
};

/**
 * base = subtotal − desconto (nunca negativa); comissão = base × bps / 10000,
 * arredondada PARA BAIXO (o centavo quebrado fica com o lojista).
 * Menos de 1 centavo não é cobrado. A comissão nunca chega ao total pago —
 * o Mercado Pago recusa application_fee maior ou igual ao valor da venda.
 */
export function calcularComissao(input: {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  bps: number;
}): Comissao {
  const bps = Math.max(0, Math.floor(input.bps));
  const baseCents = Math.max(0, input.subtotalCents - input.discountCents);
  let feeCents = Math.floor((baseCents * bps) / 10000);
  if (feeCents < 1) feeCents = 0;
  if (feeCents >= input.totalCents)
    feeCents = Math.max(0, input.totalCents - 1);
  return { bps, baseCents, feeCents };
}
