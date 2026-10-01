/**
 * Desconto do "Compre junto": o produto principal (A) tem uma lista de
 * sugeridos e um percentual. Cada unidade de A no carrinho dá desconto em
 * uma unidade de cada sugerido que também está no carrinho (camisa + calça
 * + tênis: desconto na calça e no tênis). O desconto sai do
 * sugerido, nunca do principal, e cada unidade sugerida só ganha uma vez,
 * mesmo que dois principais a sugiram.
 *
 * Tudo em centavos inteiros: nada de arredondamento de float no dinheiro.
 */
export type LinhaDoCarrinho = {
  productId: string;
  /** Preço unitário em centavos (da variação, se houver) */
  precoCents: number;
  quantidade: number;
};

export type RegraDeCombo = { pct: number; sugeridos: string[] };

export const MAX_DESCONTO_COMBO_PCT = 30;

export function descontoDoComboCents(
  linhas: LinhaDoCarrinho[],
  regras: Map<string, RegraDeCombo>,
): number {
  // Unidades de cada produto ainda sem desconto (mais cara primeiro: o
  // cliente sai ganhando quando a mesma peça tem variações de preço)
  const livres = new Map<string, { precoCents: number; qtd: number }[]>();
  for (const l of linhas) {
    if (l.quantidade <= 0 || l.precoCents <= 0) continue;
    const lista = livres.get(l.productId) ?? [];
    lista.push({ precoCents: l.precoCents, qtd: l.quantidade });
    lista.sort((a, b) => b.precoCents - a.precoCents);
    livres.set(l.productId, lista);
  }

  const qtdPorProduto = new Map<string, number>();
  for (const l of linhas) {
    qtdPorProduto.set(
      l.productId,
      (qtdPorProduto.get(l.productId) ?? 0) + Math.max(0, l.quantidade),
    );
  }

  // Principais com desconto maior primeiro
  const principais = [...regras.entries()]
    .filter(([id, r]) => r.pct > 0 && (qtdPorProduto.get(id) ?? 0) > 0)
    .sort((a, b) => b[1].pct - a[1].pct);

  let total = 0;
  for (const [principalId, regra] of principais) {
    const pct = Math.min(Math.max(regra.pct, 0), MAX_DESCONTO_COMBO_PCT);
    for (const sugeridoId of regra.sugeridos) {
      if (sugeridoId === principalId) continue;
      let vezes = qtdPorProduto.get(principalId) ?? 0;
      for (const lote of livres.get(sugeridoId) ?? []) {
        const usar = Math.min(lote.qtd, vezes);
        if (usar <= 0) continue;
        total += Math.floor((lote.precoCents * pct) / 100) * usar;
        lote.qtd -= usar;
        vezes -= usar;
        if (vezes <= 0) break;
      }
    }
  }
  return total;
}
