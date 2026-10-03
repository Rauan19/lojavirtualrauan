/**
 * Preço com o desconto do Pix, só para mostrar na vitrine. Mesma conta da
 * API (produtos, arredondado para baixo a favor do lojista); quem cobra de
 * verdade é o servidor.
 */
export function precoNoPix(valor: number, percentual?: number | null): number {
  const pct = Number(percentual);
  if (!Number.isFinite(pct) || pct <= 0 || !Number.isFinite(valor))
    return valor;
  const centavos = Math.round(valor * 100);
  const desconto = Math.floor((centavos * Math.min(pct, 50)) / 100);
  return (centavos - desconto) / 100;
}

/** "5" ou "2,5" para texto. */
export function pctTexto(percentual: number): string {
  return String(percentual).replace('.', ',');
}
