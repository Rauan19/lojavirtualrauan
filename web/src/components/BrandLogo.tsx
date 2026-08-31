import { BRAND } from '@/lib/brand';

/*
 * Duas versões do mesmo lockup:
 * - wordmark (carrinho + "vendira"): padrão, é a que roda em tamanho pequeno.
 *   A tagline embutida na arte fica ilegível abaixo de ~60px de altura.
 * - completa (com "Loja Online • Pronta para Vender"): só onde a marca aparece
 *   grande e sozinha.
 *
 * A arte já vem com fundo transparente, então serve tanto no claro quanto no
 * escuro — turquesa e coral têm contraste nos dois. Só a tagline é escura, e
 * por isso a versão completa não deve ir para fundo escuro.
 */

const ART = {
  wordmark: { src: '/brand/vendira-wordmark.webp', ratio: 536 / 140 },
  full: { src: '/brand/vendira-logo.webp', ratio: 765 / 200 },
} as const;

type BrandLogoProps = {
  className?: string;
  height?: number;
  /** Mantido por compatibilidade: a arte atual funciona nos dois fundos. */
  onDark?: boolean;
  /** Inclui a tagline. Use só em tamanho grande (a partir de ~60px). */
  withTagline?: boolean;
  priority?: boolean;
};

export function BrandLogo({
  className = '',
  height = 28,
  withTagline = false,
  priority = false,
}: BrandLogoProps) {
  const art = withTagline ? ART.full : ART.wordmark;
  const width = Math.round(height * art.ratio);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.src}
      alt={BRAND.name}
      width={width}
      height={height}
      className={className}
      style={{ height, width: 'auto' }}
      loading={priority ? 'eager' : 'lazy'}
      // A logo do header é elemento de primeira dobra: sem isso o navegador
      // atrasa o decode e a marca pisca na entrada.
      decoding={priority ? 'sync' : 'async'}
    />
  );
}
