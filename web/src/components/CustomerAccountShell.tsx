'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/CustomerProvider';
import { api, mediaUrl } from '@/lib/api';
import { corDeTexto, tintaSobre } from '@/lib/contraste';

type Marca = { name: string; logoUrl?: string | null; accentColor: string };

type Props = {
  storeSlug: string;
  children: React.ReactNode;
};

const nav = (slug: string) =>
  [
    {
      href: `/loja/${slug}/conta`,
      label: 'Minha conta',
      match: (path: string) =>
        path === `/loja/${slug}/conta` || path.endsWith('/conta'),
    },
    {
      href: `/loja/${slug}/conta/pedidos`,
      label: 'Minhas compras',
      match: (path: string) => path.includes('/conta/pedidos'),
    },
    {
      href: `/loja/${slug}/favoritos`,
      label: 'Favoritos',
      match: () => false,
    },
  ] as const;

export function CustomerAccountShell({ storeSlug, children }: Props) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { customer, loading, logout } = useCustomer();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = nav(storeSlug);
  const homeHref = `/loja/${storeSlug}`;
  // A conta é da loja, não da plataforma: nome, logo e cor dela
  const [marca, setMarca] = useState<Marca | null>(null);
  useEffect(() => {
    api<Marca>(`/stores/public/${storeSlug}`)
      .then(setMarca)
      .catch(() => setMarca(null));
  }, [storeSlug]);
  const cor = marca?.accentColor || '#1f2430';
  const temaDaLoja = {
    '--store-accent': cor,
    '--store-accent-hover': `color-mix(in srgb, ${cor} 86%, #000)`,
    '--store-accent-ink': tintaSobre(cor),
    '--store-accent-text': corDeTexto(cor),
  } as React.CSSProperties;

  const isAuthPage =
    pathname.includes('/conta/entrar') ||
    pathname.includes('/conta/cadastro') ||
    pathname.includes('/conta/esqueci-senha') ||
    pathname.includes('/conta/redefinir-senha');

  useEffect(() => {
    if (loading || isAuthPage) return;
    if (!customer) {
      router.replace(
        `/loja/${storeSlug}/conta/entrar?next=${encodeURIComponent(pathname)}`,
      );
    }
  }, [loading, customer, isAuthPage, router, storeSlug, pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (loading || !customer) {
    return <p className="p-8 text-sm text-muted">Carregando sua conta…</p>;
  }

  // O narrowing do `if` acima não alcança dentro da função aninhada:
  // guarda em um const já estreitado.
  const account = customer;

  function renderSideLinks() {
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            style={{ background: 'var(--store-accent)', color: 'var(--store-accent-ink)' }}
            aria-hidden
          >
            {account.name.trim().charAt(0).toUpperCase() || '·'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{account.name}</span>
            <span className="block truncate text-xs text-muted">{account.email}</span>
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 pb-2" aria-label="Menu da conta">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[color-mix(in_srgb,var(--store-accent)_10%,#fff)] text-[var(--store-accent-text)]'
                    : 'text-ink hover:bg-[#f3f4f6]'
                }`}
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href={homeHref}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-[#f3f4f6]"
            onClick={() => setDrawerOpen(false)}
          >
            Voltar à loja
          </Link>
        </nav>
        <div className="border-t border-line p-2">
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#b42318] hover:bg-[#fef3f2]"
            onClick={() => {
              logout();
              setDrawerOpen(false);
              router.push(homeHref);
            }}
          >
            Sair da conta
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="loja-ui min-h-screen bg-[#f4f5f7]" style={temaDaLoja}>
      <div className="hidden border-b border-line bg-white md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href={homeHref} className="flex items-center">
            {marca?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(marca.logoUrl) || ''} alt={marca.name} className="h-9 max-w-[170px] object-contain" />
            ) : (
              <span className="text-lg font-bold tracking-tight text-[var(--store-accent-text)]">
                {marca?.name || 'Loja'}
              </span>
            )}
          </Link>
          <Link href={homeHref} className="text-sm font-medium text-muted hover:text-ink">
            Voltar à loja
          </Link>
        </div>
      </div>
      <header className="sticky top-0 z-20 border-b border-line bg-white md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            className="icon-btn"
            aria-label="Abrir menu da conta"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Minha conta</p>
            <p className="truncate text-[11px] text-muted">{customer.name}</p>
          </div>
          <Link href={homeHref} className="text-xs font-medium text-muted underline">
            Loja
          </Link>
        </div>
      </header>

      <div
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''} md:!hidden`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside
        className={`drawer ${drawerOpen ? 'open' : ''} md:!hidden`}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <strong className="text-sm font-bold">Menu</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar"
            onClick={() => setDrawerOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        {renderSideLinks()}
      </aside>

      <div className="mx-auto flex max-w-5xl gap-0 md:gap-6 md:px-4 md:py-8">
        <aside className="hidden w-60 shrink-0 overflow-hidden rounded-2xl border border-line bg-white md:flex md:flex-col md:self-start">
          {renderSideLinks()}
        </aside>
        <div className="min-w-0 flex-1 bg-white md:rounded-2xl md:border md:border-line md:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
