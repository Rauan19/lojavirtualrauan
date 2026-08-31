'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { api, AuthUser } from '@/lib/api';
import { clearSession, getToken, saveSession } from '@/lib/auth';

const nav = [
  { href: '/super', label: 'Dashboard', exact: true },
  { href: '/super/lojas', label: 'Lojas' },
  { href: '/super/planos', label: 'Planos' },
  { href: '/super/mercadopago', label: 'Mercado Pago' },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SuperLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // localStorage não é fonte de verdade: token expirado, sessão revogada
    // (troca de senha, usuário desativado) ou até um valor forjado no
    // devtools ainda passariam se a gente só olhasse o que está salvo aqui.
    // /auth/me confirma no servidor antes de mostrar qualquer coisa.
    let cancelled = false;
    async function verify() {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }
      try {
        const fresh = await api<AuthUser>('/auth/me', { token });
        if (cancelled) return;
        if (fresh.role !== 'SUPER_ADMIN') {
          router.replace('/login');
          return;
        }
        saveSession(token, fresh);
        setUser(fresh);
      } catch {
        if (cancelled) return;
        clearSession();
        router.replace('/login');
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  const side = (
    <>
      <div className="border-b border-[#d9dde3] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Super admin
        </p>
        <p className="mt-0.5 truncate text-sm font-bold">{user.email}</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
          Menu
        </p>
        {nav.map((item) => {
          const active = isActive(pathname, item.href, 'exact' in item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`mx-2 block rounded px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-ink font-semibold text-white'
                  : 'text-ink hover:bg-[#eef0f3]'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        className="border-t border-[#d9dde3] px-4 py-3 text-left text-sm font-medium text-accent"
        onClick={() => {
          clearSession();
          router.push('/login');
        }}
      >
        Sair
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#171a1f] md:grid md:grid-cols-[220px_1fr]">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-[#d9dde3] bg-white px-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandLogo height={30} />
          <strong className="text-sm">Super admin</strong>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Menu"
          onClick={() => setOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <aside className="hidden border-r border-[#d9dde3] bg-white md:flex md:flex-col">
        <div className="border-b border-[#d9dde3] px-4 py-4">
          <BrandLogo height={34} />
        </div>
        {side}
      </aside>

      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`drawer ${open ? 'open' : ''} md:hidden`}>{side}</aside>

      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
