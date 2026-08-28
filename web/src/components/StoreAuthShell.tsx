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
      .catch(() =>
        setStore({
          name: 'Loja',
          slug,
          primaryColor: '#1a1a1a',
          accentColor: '#e31c5f',
        }),
      );
  }, [slug]);

  const primary = store?.primaryColor || '#1a1a1a';
  const accent = store?.accentColor || '#e31c5f';
  const logo = mediaUrl(store?.logoUrl);
  const name = store?.name || 'Loja';

  return (
    <main
      className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-white"
      style={
        {
          '--store-primary': primary,
          '--store-accent': accent,
          backgroundColor: '#ffffff',
        } as React.CSSProperties
      }
    >
      <header className="flex h-12 shrink-0 items-center border-b border-line px-4">
        <Link
          href={`/loja/${slug}`}
          className="text-sm text-muted transition hover:text-ink"
        >
          ← Voltar à loja
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center px-4 pt-10 sm:items-center sm:pt-0 sm:pb-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-4 text-center">
            <Link href={`/loja/${slug}`} className="mb-3 inline-block">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={name}
                  className="mx-auto h-16 max-w-[240px] object-contain sm:h-20 sm:max-w-[280px]"
                />
              ) : (
                <span
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: primary }}
                >
                  {name}
                </span>
              )}
            </Link>
            <h1 className="text-lg font-bold tracking-tight text-ink">{title}</h1>
            <p className="mt-1 text-[13px] leading-snug text-muted">{subtitle}</p>
          </div>

          <div
            className="border border-line bg-white p-4 sm:p-5"
            style={{ borderTopWidth: 3, borderTopColor: accent }}
          >
            {children}
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
      <label className="label">{label}</label>
      <div className="relative">
        <input
          className={`field pr-16 ${error ? '!border-accent' : ''}`}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-1 text-xs font-medium text-muted hover:text-ink"
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
