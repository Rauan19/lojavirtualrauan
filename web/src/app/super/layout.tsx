'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { IconeMenu } from '@/components/admin/IconeMenu';
import { api, AuthUser } from '@/lib/api';
import { clearSession, getToken, saveSession } from '@/lib/auth';

const nav = [
  { href: '/super', label: 'Dashboard', exact: true },
  { href: '/super/lojas', label: 'Lojas' },
  { href: '/super/planos', label: 'Planos' },
  { href: '/super/comissoes', label: 'Comissões' },
  { href: '/super/mercadopago', label: 'Mercado Pago' },
  { href: '/super/seguranca', label: 'Segurança' },
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
  /** Super Admin sem verificação em duas etapas: só a tela de ativação abre. */
  const [precisaAtivar, setPrecisaAtivar] = useState(false);

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
        const fresh = await api<AuthUser & { ativarDoisFatores?: boolean }>(
          '/auth/me',
          { token },
        );
        if (cancelled) return;
        if (fresh.role !== 'SUPER_ADMIN') {
          router.replace('/login');
          return;
        }
        saveSession(token, fresh);
        setPrecisaAtivar(Boolean(fresh.ativarDoisFatores));
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
    if (precisaAtivar && pathname !== '/super/seguranca') {
      router.replace('/super/seguranca');
    }
  }, [precisaAtivar, pathname, router]);

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

  const itens = precisaAtivar
    ? nav.filter((i) => i.href === '/super/seguranca')
    : nav;

  const side = (
    <>
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl px-1 py-1">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-deep)] text-white"
            aria-hidden
          >
            <IconeMenu href="/super/seguranca" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight">
              Super admin
            </span>
            <span className="block truncate text-xs text-muted">
              {user.email}
            </span>
          </span>
        </div>
      </div>
      <nav
        className="flex-1 overflow-y-auto py-2"
        aria-label="Menu do super admin"
      >
        <p className="px-5 pb-1 pt-3 text-[12px] font-semibold text-muted">
          Plataforma
        </p>
        {itens.map((item) => {
          const active = isActive(pathname, item.href, 'exact' in item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${
                active
                  ? 'bg-[var(--brand-deep)] font-semibold text-white'
                  : 'text-ink hover:bg-[#e9f1f3]'
              }`}
            >
              <IconeMenu href={item.href} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        className="mx-2 mb-2 flex items-center gap-3 rounded-lg border-t border-line px-3 py-2.5 text-left text-[14px] font-medium text-[#b42318] hover:bg-[#fef3f2]"
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
    <div className="min-h-screen bg-[#f4f6f8] text-[#171a1f] md:grid md:grid-cols-[240px_1fr]">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-white px-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandLogo height={26} />
          <span className="rounded-full bg-[#e9f1f3] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-deep)]">
            Super admin
          </span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <aside className="sticky top-0 hidden h-screen border-r border-line bg-white md:flex md:flex-col">
        <div className="px-5 pb-1 pt-4">
          <BrandLogo height={30} />
        </div>
        {side}
      </aside>

      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`drawer flex flex-col ${open ? 'open' : ''} md:hidden`}>
        {side}
      </aside>

      <main className="painel min-w-0 bg-[#f4f6f8] p-3 md:p-5">{children}</main>
    </div>
  );
}
