function PixIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.5 3.5l2.3 2.3a3 3 0 002.1.9h.4a3 3 0 002.1-.9l2.1-2.1M9.5 20.5l2.3-2.3a3 3 0 012.1-.9h.4a3 3 0 012.1.9l2.1 2.1M3.5 14.5l2.3-2.3a3 3 0 000-2.1L3.5 7.8M20.5 14.5l-2.3-2.3a3 3 0 010-2.1l2.3-2.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 14.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Selo estático de meios de pagamento aceitos — mesmo pra todas as lojas da plataforma. */
export function PaymentBadges({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-[11px] text-muted ${className}`}>
      <span className="flex items-center gap-1.5">
        <PixIcon /> Pix
      </span>
      <span className="flex items-center gap-1.5">
        <CardIcon /> Cartão
      </span>
    </div>
  );
}
