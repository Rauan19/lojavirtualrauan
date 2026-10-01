/**
 * Desconto para quem paga no Pix.
 *
 * Sobre os produtos menos o cupom — o frete não entra, igual à taxa da
 * Vendira. Em centavos, arredondado para baixo (a favor do lojista): 5% de
 * R$ 99,99 = R$ 4,99.
 */
export function descontoPixCentavos(input: {
  subtotalCents: number;
  descontoCents: number;
  percentual: number;
}): number {
  const pct = Number(input.percentual);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const base = Math.max(0, input.subtotalCents - input.descontoCents);
  return Math.floor((base * Math.min(pct, 50)) / 100);
}

/** Pagamento é Pix? (o Brick manda "pix"; a consulta ao MP também) */
export function ehPix(metodo: unknown): boolean {
  return String(metodo || '').toLowerCase() === 'pix';
}
