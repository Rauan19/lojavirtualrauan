/**
 * Versão dos Termos de Uso / Política de Privacidade em vigor.
 *
 * Mesma data de web/src/lib/legal.ts (TERMS_VERSION). É o que fica gravado no
 * aceite de cada loja, então mude as duas juntas quando o texto mudar.
 */
export const TERMS_VERSION = '2026-09-30';

/**
 * Primeira versão dos termos que fala da taxa por venda. A comissão só é
 * cobrada de loja que aceitou esta versão ou uma mais nova (datas ISO
 * comparam como texto).
 */
export const TERMS_FEE_VERSION = '2026-09-30';

export function aceitouTermosDaTaxa(termsVersion: string | null | undefined) {
  return (termsVersion ?? '') >= TERMS_FEE_VERSION;
}
