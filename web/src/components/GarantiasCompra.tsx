import Link from 'next/link';
import { money } from '@/lib/api';

/**
 * O que tranquiliza quem vai pagar, colado no botão de comprar e não no
 * rodapé. Só afirma o que é verdade para toda loja da plataforma: pagamento
 * processado pelo Mercado Pago, política de troca publicada pela loja e,
 * quando a loja configurou, frete grátis acima de um valor.
 */
export function GarantiasCompra({
  storeSlug,
  freteGratisAcima,
}: {
  storeSlug: string;
  freteGratisAcima?: number | null;
}) {
  const itens = [
    {
      icone: <IconeEscudo />,
      texto: 'Compra segura',
      detalhe: 'Pagamento protegido pelo Mercado Pago',
    },
    ...(freteGratisAcima && freteGratisAcima > 0
      ? [
          {
            icone: <IconeCaminhao />,
            texto: `Frete grátis acima de ${money(freteGratisAcima)}`,
            detalhe: 'Calcule o prazo pelo seu CEP',
          },
        ]
      : []),
    {
      icone: <IconeTroca />,
      texto: 'Troca e devolução',
      detalhe: (
        <Link
          href={`/loja/${storeSlug}/politicas/trocas`}
          className="underline underline-offset-2 hover:text-ink"
        >
          Ver como funciona
        </Link>
      ),
    },
  ];

  return (
    <ul className="mt-5 grid gap-3 border-y border-line py-4">
      {itens.map((i) => (
        <li key={i.texto} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-[var(--store-accent-text,#111)]">
            {i.icone}
          </span>
          <span className="min-w-0 text-[13px] leading-snug">
            <strong className="block font-semibold text-ink">{i.texto}</strong>
            <span className="text-muted">{i.detalhe}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const svg = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconeEscudo() {
  return (
    <svg {...svg}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
    </svg>
  );
}

function IconeCaminhao() {
  return (
    <svg {...svg}>
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 9.5h4l3 3.2v2.8h-7" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}

function IconeTroca() {
  return (
    <svg {...svg}>
      <path d="M4 9h13l-3.5-3.5" />
      <path d="M20 15H7l3.5 3.5" />
    </svg>
  );
}
