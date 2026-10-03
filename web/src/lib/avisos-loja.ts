import { money } from '@/lib/api';
import { pctTexto } from '@/lib/pix';

type Cupom = {
  code: string;
  description?: string | null;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: string | number;
} | null;

/**
 * Mensagens da faixa de avisos no topo da vitrine (padrão das lojas
 * Shopify/Nuvemshop). Só o que a loja configurou de verdade: frete grátis,
 * desconto no Pix e o cupom em destaque.
 */
export function avisosDaLoja(
  loja: {
    freteGratisAcima?: string | number | null;
    freteModo?: string | null;
    pixDiscountPercent?: number | null;
  },
  cupom?: Cupom,
): string[] {
  const avisos: string[] = [];
  const freteAcima = Number(loja.freteGratisAcima) || 0;
  if (loja.freteModo === 'gratis') {
    avisos.push('Frete grátis em todos os pedidos');
  } else if (freteAcima > 0) {
    avisos.push(`Frete grátis acima de ${money(freteAcima)}`);
  }
  if (loja.pixDiscountPercent && loja.pixDiscountPercent > 0) {
    avisos.push(
      `${pctTexto(loja.pixDiscountPercent)}% de desconto pagando no Pix`,
    );
  }
  if (cupom) {
    const beneficio =
      cupom.type === 'FREE_SHIPPING'
        ? 'frete grátis'
        : cupom.type === 'PERCENT'
          ? `${Number(cupom.value)}% de desconto`
          : `${money(Number(cupom.value))} de desconto`;
    avisos.push(`Cupom ${cupom.code}: ${beneficio}`);
  }
  return avisos;
}
