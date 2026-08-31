import Link from 'next/link';

function BagIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M4.4 6.5h11.2l-.9 9.1a1.4 1.4 0 0 1-1.4 1.3H6.7a1.4 1.4 0 0 1-1.4-1.3L4.4 6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.4 8.2V5.9a2.6 2.6 0 0 1 5.2 0v2.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden>
      <path
        d="M3.8 10h11.4M10.6 5.4 15.2 10l-4.6 4.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * CTA de assinatura da landing. Não é um `.btn` com padding aumentado: a
 * célula da seta é separada por um filete, e é ela que carrega o único
 * movimento da página — a seta cutuca sozinha de tempos em tempos e troca de
 * lugar com a seguinte no hover.
 */
export function LandingCta({
  href,
  label,
  tone = 'accent',
  className = '',
}: {
  href: string;
  label: string;
  tone?: 'accent' | 'light';
  className?: string;
}) {
  return (
    <Link href={href} className={`lp-cta lp-cta--${tone} ${className}`.trim()}>
      <span className="lp-cta__body">
        <BagIcon />
        {label}
      </span>
      <span className="lp-cta__arrow" aria-hidden>
        <ArrowIcon />
        <ArrowIcon />
      </span>
    </Link>
  );
}
