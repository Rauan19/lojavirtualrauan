'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/CustomerProvider';

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
    return <p className="p-8 text-sm text-muted">Carregando conta...</p>;
  }

  // O narrowing do `if` acima não alcança dentro da função aninhada:
  // guarda em um const já estreitado.
  const account = customer;

  function renderSideLinks() {
    return (
      <>
        <div className="border-b border-line px-4 py-4">
          <p className="text-sm font-semibold">{account.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{account.email}</p>
        </div>
        <nav className="flex-1 py-2">
          <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            Menu da conta
          </p>
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block border-b border-line px-4 py-3 text-sm font-medium ${
                  active
                    ? 'bg-[#fafafa] text-[var(--store-accent,#e11d48)]'
                    : ''
                }`}
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href={homeHref}
            className="block border-b border-line px-4 py-3 text-sm font-medium"
            onClick={() => setDrawerOpen(false)}
          >
            Voltar à loja
          </Link>
        </nav>
        <div className="border-t border-line p-4">
          <button
            type="button"
            className="w-full border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-bold text-white"
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
    <div className="min-h-screen bg-[#fafafa]">
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
        <aside className="hidden w-56 shrink-0 border border-line bg-white md:flex md:flex-col md:self-start">
          {renderSideLinks()}
        </aside>
        <div className="min-w-0 flex-1 bg-white md:border md:border-line md:p-6">
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
