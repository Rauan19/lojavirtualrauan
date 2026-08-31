'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, mediaUrl } from '@/lib/api';

type StoreBrand = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
};

type CatalogItem = { id: string; images: { url: string }[] };

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

/** Logo em chip claro: a maioria das lojas envia JPG com fundo branco, que
 *  desaparece (ou vira bloco) se jogado direto sobre o painel escuro. */
function LogoChip({
  logo,
  name,
  color,
  className = '',
}: {
  logo: string | null;
  name: string;
  color: string;
  className?: string;
}) {
  if (logo) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-white p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={name} className="h-11 max-w-[168px] object-contain" />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-xl bg-white px-3 py-2 text-lg font-bold tracking-tight shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${className}`}
      style={{ color }}
    >
      {name || 'Loja'}
    </span>
  );
}

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
  const [shots, setShots] = useState<string[]>([]);

  useEffect(() => {
    api<StoreBrand>(`/stores/public/${slug}`)
      .then(setStore)
      .catch(() => setStore(null));

    // Mosaico com o catálogo real: cada loja ganha uma tela diferente, e o
    // cliente vê o que está comprando em vez de um fundo decorativo qualquer.
    api<{ items: CatalogItem[] }>(`/catalog/products?limit=12`, { storeSlug: slug })
      .then((res) => {
        const urls = res.items
          .map((p) => mediaUrl(p.images?.[0]?.url))
          .filter((u): u is string => Boolean(u))
          .slice(0, 9);
        setShots(urls);
      })
      .catch(() => setShots([]));
  }, [slug]);

  const primary = store?.primaryColor || '#1f2430';
  const accent = store?.accentColor || '#1f2430';
  const logo = mediaUrl(store?.logoUrl);
  const name = store?.name || '';

  return (
    <main
      className="fixed inset-0 z-20 grid overflow-y-auto bg-white lg:grid-cols-[1.05fr_1fr]"
      style={
        {
          '--store-primary': primary,
          '--store-accent': accent,
          '--store-accent-hover': `color-mix(in srgb, ${accent} 86%, #000)`,
        } as React.CSSProperties
      }
    >
      <aside className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
        {/* Camada 1: vitrine da própria loja */}
        {shots.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
            {shots.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${src}-${i}`} src={src} alt="" className="h-full w-full object-cover" />
            ))}
          </div>
        ) : null}

        {/* Camada 2: cor da loja por cima, forte o bastante para o texto ler */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(155deg, color-mix(in srgb, ${primary} 96%, #000) 4%, color-mix(in srgb, ${primary} 88%, transparent) 46%, color-mix(in srgb, ${accent} 82%, ${primary}) 100%)`,
            opacity: shots.length > 0 ? 0.94 : 1,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ background: accent }}
          aria-hidden
        />
        {/* Camada 3: escurece só a metade de baixo, onde fica o texto. Sem
            isso uma foto clara do catálogo apaga o título e o subtítulo. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/60 via-black/25 to-transparent"
          aria-hidden
        />

        <Link href={`/loja/${slug}`} className="relative">
          <LogoChip logo={logo} name={name} color={primary} />
        </Link>

        <div className="relative">
          <h2 className="max-w-[15ch] text-[2.5rem] font-extrabold leading-[1.05] tracking-tight xl:text-[3rem]">
            Sua conta, suas compras.
          </h2>
          <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-white/85">
            Entre para acompanhar tudo que você comprou{name ? ` na ${name}` : ''} e
            finalizar a próxima em segundos.
          </p>

          <ul className="mt-7 flex flex-wrap gap-2">
            {PERKS.map((p) => (
              <li
                key={p.text}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] text-white/90 backdrop-blur-[2px]"
              >
                {p.icon}
                {p.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-white/55">
          {name ? `${name} · ` : ''}Ambiente seguro
        </p>
      </aside>

      <div className="flex flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 lg:px-8">
          <Link
            href={`/loja/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
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
        </header>

        <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:items-center sm:pt-0 lg:px-8">
          <div className="w-full max-w-[400px]">
            {/* No celular a marca aparece aqui, já que o painel não é exibido */}
            <Link href={`/loja/${slug}`} className="mb-6 block lg:hidden">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={name} className="h-12 max-w-[190px] object-contain" />
              ) : (
                <span className="text-xl font-bold tracking-tight" style={{ color: primary }}>
                  {name}
                </span>
              )}
            </Link>

            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">
              {title}
            </h1>
            <p className="mt-1.5 text-[14px] leading-snug text-muted">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </div>
        </div>
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
