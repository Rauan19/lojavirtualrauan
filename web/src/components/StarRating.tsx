type Props = {
  value: number;
  size?: number;
  className?: string;
};

function Star({ fill, size }: { fill: number; size: number }) {
  const id = `star-clip-${Math.random().toString(36).slice(2)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={20 * fill} height="20" />
        </clipPath>
      </defs>
      <path
        d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.6-4.1 6.1-.6L10 1.5z"
        fill="none"
        stroke="#d9dde3"
        strokeWidth="1"
      />
      <g clipPath={`url(#${id})`}>
        <path
          d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.6-4.1 6.1-.6L10 1.5z"
          fill="#f5a623"
        />
      </g>
    </svg>
  );
}

/** Estrelas de exibição (não interativas) — 0 a 5, com preenchimento parcial. */
export function StarRating({ value, size = 13, className = '' }: Props) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <div className={`inline-flex items-center gap-[1px] ${className}`} role="img" aria-label={`${v.toFixed(1)} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, v - i))} />
      ))}
    </div>
  );
}

/** Estrelas clicáveis, pra formulário de avaliação. */
export function StarRatingInput({
  value,
  onChange,
  size = 22,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            className="p-0.5"
          >
            <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
              <path
                d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.6-4.1 6.1-.6L10 1.5z"
                fill={filled ? '#f5a623' : 'none'}
                stroke={filled ? '#f5a623' : '#d9dde3'}
                strokeWidth="1"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
