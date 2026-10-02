'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, mediaUrl } from '@/lib/api';
import { corDeTexto, tintaSobre } from '@/lib/contraste';

type StoreBrand = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
};

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2.2 2.2L15.5 10"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 6.5h11v9h-11v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13.5 10h3.5l3.5 3v2.5h-7V10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="6.5" cy="17.5" r="1.7" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="17.5" r="1.7" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13 3L5.5 13H11l-1 8 7.5-10H12l1-8z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PERKS = [
  { icon: <TruckIcon />, text: 'Acompanhe pedidos e rastreio' },
  { icon: <BoltIcon />, text: 'Checkout rápido com endereço salvo' },
  { icon: <ShieldIcon />, text: 'Pagamento protegido' },
];

export function StoreAuthShell({
  slug,
  title,
  subtitle,
  children,
}: {
  slug: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [store, setStore] = useState<StoreBrand | null>(null);

  useEffect(() => {
    api<StoreBrand>(`/stores/public/${slug}`)
      .then(setStore)
      .catch(() => setStore(null));

  }, [slug]);

  const primary = store?.primaryColor || '#1f2430';
  const accent = store?.accentColor || '#1f2430';
  const logo = mediaUrl(store?.logoUrl);
  const name = store?.name || '';

  /*
   * Mesmo padrão do login da plataforma (Nuvemshop): a página inteira na cor
   * da loja e o formulário num cartão branco. Atrás, bem apagado, o mosaico
   * com o catálogo da própria loja: cada loja ganha uma tela que é só dela.
   */
  return (
    <main
      className="fixed inset-0 z-20 overflow-y-auto"
      style={
        {
          '--store-primary': primary,
          '--store-accent': accent,
          '--store-accent-hover': `color-mix(in srgb, ${accent} 86%, #000)`,
          '--store-accent-ink': tintaSobre(accent),
          '--store-accent-text': corDeTexto(accent),
          // Cor única, a principal da loja; o texto ao lado lê em cima dela
          background: primary,
          color: tintaSobre(primary),
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto grid min-h-full max-w-[1180px] content-start gap-6 px-4 py-6 md:grid-cols-[minmax(0,440px)_minmax(0,1fr)] md:content-center md:items-center md:gap-16 md:px-8 md:py-10">
        <Link
          href={`/loja/${slug}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm opacity-80 transition hover:opacity-100 md:col-span-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Voltar à loja
        </Link>

        <section className="auth-card w-full rounded-[22px] bg-white p-6 text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)] sm:p-9">
          <Link href={`/loja/${slug}`} className="mb-6 inline-block">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={name} className="h-11 max-w-[180px] object-contain" />
            ) : (
              <span
                className="text-xl font-bold tracking-tight"
                style={{ color: 'var(--store-accent-text)' }}
              >
                {name}
              </span>
            )}
          </Link>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
            {title}
          </h1>
          <p className="mt-1.5 text-[14px] leading-snug text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </section>

        <aside className="hidden md:block">
          <h2 className="max-w-[15ch] text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-balance xl:text-[3rem]">
            Sua conta, suas compras.
          </h2>
          <p className="mt-3 max-w-[36ch] text-[16px] leading-relaxed opacity-85">
            Acompanhe tudo que você comprou{name ? ` na ${name}` : ''} e finalize a
            próxima em segundos.
          </p>
          <ul className="mt-7 space-y-3">
            {PERKS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-[15px] opacity-90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-current/15">
                  {p.icon}
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-[13px] opacity-70">
            {name ? `${name} · ` : ''}Ambiente seguro
          </p>
        </aside>
      </div>
    </main>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      {/* label vazio quando quem chama já desenhou o cabeçalho do campo */}
      {label ? <label className="label">{label}</label> : null}
      <div className="relative">
        <input
          className={`field h-11 pr-20 text-[15px] ${error ? '!border-accent' : ''}`}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-[#f2f4f7] hover:text-ink"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-accent">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
