import { BRAND } from '@/lib/brand';

type BrandLogoProps = {
  className?: string;
  height?: number;
  /** Versão clara pra fundo escuro */
  onDark?: boolean;
  priority?: boolean;
};

export function BrandLogo({
  className = '',
  height = 28,
  onDark = false,
}: BrandLogoProps) {
  const width = Math.round(height * (220 / 48));
  const ink = onDark ? '#ffffff' : '#171a1f';
  const accent = '#e31c5f';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 48"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={BRAND.name}
    >
      <path
        d="M8 8 L20 40 L32 8"
        stroke={accent}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M38 14 H52 V34 H38 V14Z"
        stroke={accent}
        strokeWidth="3.5"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M38 22 H52" stroke={accent} strokeWidth="3.5" />
      <text
        x="64"
        y="34"
        fill={ink}
        style={{
          fontFamily: 'var(--font-brand), Syne, Arial Black, sans-serif',
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '-0.04em',
        }}
      >
        {BRAND.name}
      </text>
    </svg>
  );
}
