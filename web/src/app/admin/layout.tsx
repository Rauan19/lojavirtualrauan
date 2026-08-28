'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { api, AuthUser } from '@/lib/api';
import { clearSession, getToken, getUser, saveSession } from '@/lib/auth';
import { supportWhatsappHref } from '@/lib/contact';
import { PlanRestrictionModal } from '@/components/PlanRestrictionModal';

type BadgeKey = 'orders' | 'refunds';
type NavItem = { href: string; label: string; badgeKey?: BadgeKey };
type NavGroup = { title: string; items: NavItem[] };

type StoreAccess = {
  status: string;
  planDueAt?: string | null;
  planState?: 'ok' | 'expiring' | 'expired' | 'none';
  accessBlocked?: boolean;
  daysLeft?: number | null;
  name?: string;
  slug?: string;
};

const navGroups: NavGroup[] = [
  {
    title: 'Visão geral',
    items: [{ href: '/admin', label: 'Dashboard' }],
  },
  {
    title: 'Catálogo',
    items: [
      { href: '/admin/products', label: 'Produtos' },
      { href: '/admin/categories', label: 'Categorias' },
      { href: '/admin/promotions', label: 'Promoções' },
      { href: '/admin/reviews', label: 'Avaliações' },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { href: '/admin/orders', label: 'Pedidos', badgeKey: 'orders' },
      { href: '/admin/refunds', label: 'Reembolsos', badgeKey: 'refunds' },
      { href: '/admin/coupons', label: 'Cupons' },
    ],
  },
  {
    title: 'Configuração',
    items: [
      { href: '/admin/settings', label: 'Loja e frete' },
      { href: '/admin/settings/planos', label: 'Planos' },
    ],
  },
  {
    title: 'Ajuda',
    items: [{ href: '/admin/suporte', label: 'Suporte' }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  // Evita marcar "Loja e frete" quando estiver em /admin/settings/planos
  if (href === '/admin/settings') return pathname === '/admin/settings';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavBadge({
  count,
  active,
  tone,
  ariaLabel,
}: {
  count: number;
  active?: boolean;
  tone: 'amber' | 'rose';
  ariaLabel: string;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  const colors =
    tone === 'rose'
      ? active
        ? 'bg-white text-rose-700'
        : 'bg-rose-600 text-white'
      : active
        ? 'bg-white text-amber-800'
        : 'bg-amber-500 text-white';
  return (
    <span
      className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${colors}`}
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingRefunds, setPendingRefunds] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [storeAccess, setStoreAccess] = useState<StoreAccess | null>(null);

  useEffect(() => {
    // Mesma lógica do /super: nunca confiar só no localStorage. Token
    // expirado, sessão revogada (senha trocada, usuário desativado) ou um
    // valor forjado no devtools são pegos aqui, contra o servidor.
    let cancelled = false;
    async function verify() {
      const cached = getUser();
      const token = getToken();
      if (!cached || !token) {
        router.replace('/login');
        return;
      }
      try {
        const fresh = await api<AuthUser>('/auth/me', { token });
        if (cancelled) return;
        if (fresh.role !== 'STORE_ADMIN' && fresh.role !== 'SUPER_ADMIN') {
          router.replace('/login');
          return;
        }
        if (fresh.role === 'SUPER_ADMIN') {
          router.replace('/super');
          return;
        }
        if (!fresh.storeId || !fresh.store?.slug) {
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

  const loadPendingBadges = useCallback(async () => {
    const u = getUser();
    const token = getToken();
    if (!u?.store?.slug || !token) return;
    const opts = { token, storeSlug: u.store.slug };
    try {
      const [refunds, orders] = await Promise.all([
        api<{ pending: number }>('/admin/refunds/pending-count', opts),
        api<{ pending: number }>('/admin/orders/pending-count', opts),
      ]);
      setPendingRefunds(refunds.pending || 0);
      setPendingOrders(orders.pending || 0);
    } catch {
      /* silencioso — não quebra o painel */
    }
  }, []);

  const loadStoreAccess = useCallback(async () => {
    const u = getUser();
    const token = getToken();
    if (!u?.store?.slug || !token) return;
    try {
      const me = await api<StoreAccess>('/stores/me', {
        token,
        storeSlug: u.store.slug,
      });
      setStoreAccess(me);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadPendingBadges();
    void loadStoreAccess();
    const timer = setInterval(() => {
      void loadPendingBadges();
      void loadStoreAccess();
    }, 20000);
    return () => clearInterval(timer);
  }, [user, pathname, loadPendingBadges, loadStoreAccess]);

  const onPlansPage = pathname.startsWith('/admin/settings/planos');
  const accessBlocked = Boolean(
    storeAccess?.accessBlocked ||
      storeAccess?.status === 'PAST_DUE' ||
      storeAccess?.status === 'SUSPENDED' ||
      storeAccess?.planState === 'expired',
  );
  const showRestrictionModal = accessBlocked && !onPlansPage;

  useEffect(() => {
    document.body.style.overflow =
      open || showRestrictionModal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, showRestrictionModal]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  const wa = supportWhatsappHref(user.store?.name, user.store?.slug);

  const nav = (
    <>
      <div className="border-b border-line px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Painel da loja
        </p>
        <h1 className="mt-0.5 truncate text-sm font-bold">
          {user.store?.name || 'Painel'}
        </h1>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-2">
            <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
              {group.title}
            </p>
            {group.items.map((link) => {
              const active = isActive(pathname, link.href);
              const badge =
                link.badgeKey === 'refunds'
                  ? pendingRefunds
                  : link.badgeKey === 'orders'
                    ? pendingOrders
                    : 0;
              const tone = link.badgeKey === 'refunds' ? 'rose' : 'amber';
              const aria =
                link.badgeKey === 'refunds'
                  ? `${badge} reembolsos pendentes`
                  : `${badge} pedidos novos`;
              const locked =
                accessBlocked && link.href !== '/admin/settings/planos';
              return (
                <Link
                  key={link.href}
                  href={locked ? '/admin/settings/planos' : link.href}
                  onClick={() => setOpen(false)}
                  className={`mx-2 flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-ink font-semibold text-white'
                      : 'text-ink hover:bg-[#eef0f3]'
                  }`}
                >
                  <span>{link.label}</span>
                  <NavBadge
                    count={badge}
                    active={active}
                    tone={tone}
                    ariaLabel={aria}
                  />
                </Link>
              );
            })}
          </div>
        ))}

        {user.store?.slug ? (
          <div className="mt-1 border-t border-line pt-2">
            <p className="px-4 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted">
              Atalhos
            </p>
            <Link
              href={`/loja/${user.store.slug}`}
              target="_blank"
              className="mx-2 block rounded px-3 py-2 text-sm text-muted transition-colors hover:bg-[#eef0f3] hover:text-ink"
              onClick={() => setOpen(false)}
            >
              Ver vitrine
            </Link>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-2 block rounded px-3 py-2 text-sm font-medium text-[#128C7E] transition-colors hover:bg-[#e8f8f5]"
                onClick={() => setOpen(false)}
              >
                WhatsApp suporte
              </a>
            ) : null}
          </div>
        ) : null}
      </nav>

      <button
        className="border-t border-line px-4 py-3 text-left text-sm font-medium text-accent"
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
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-white px-3 md:hidden">
        <strong className="text-sm">{user.store?.name || 'Admin'}</strong>
        <div className="flex items-center gap-2">
          {pendingOrders > 0 ? (
            <Link
              href="/admin/orders"
              className="relative inline-flex h-8 items-center gap-1 rounded bg-amber-50 px-2 text-xs font-bold text-amber-800 ring-1 ring-amber-200"
              aria-label={`${pendingOrders} pedidos novos`}
            >
              Pedidos
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                {pendingOrders > 99 ? '99+' : pendingOrders}
              </span>
            </Link>
          ) : null}
          {pendingRefunds > 0 ? (
            <Link
              href="/admin/refunds"
              className="relative inline-flex h-8 items-center gap-1 rounded bg-rose-50 px-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200"
              aria-label={`${pendingRefunds} reembolsos pendentes`}
            >
              Reembolsos
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">
                {pendingRefunds > 99 ? '99+' : pendingRefunds}
              </span>
            </Link>
          ) : null}
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
        </div>
      </header>

      <aside className="hidden border-r border-line bg-white md:flex md:flex-col">
        {nav}
      </aside>

      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`drawer ${open ? 'open' : ''} md:hidden`}>{nav}</aside>

      <main
        className={`min-w-0 bg-[#f6f7f9] p-3 md:p-4 ${
          showRestrictionModal ? 'pointer-events-none select-none blur-[2px]' : ''
        }`}
        aria-hidden={showRestrictionModal || undefined}
      >
        {!accessBlocked &&
        storeAccess?.status === 'TRIAL' &&
        storeAccess.daysLeft != null &&
        !onPlansPage ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-[#f0d998] bg-[#fff8e1] px-3 py-2 text-sm text-[#6b4f00]">
            <span>
              {storeAccess.daysLeft > 0
                ? `Você está no teste grátis: ${storeAccess.daysLeft} dia${storeAccess.daysLeft === 1 ? '' : 's'} restante${storeAccess.daysLeft === 1 ? '' : 's'}.`
                : 'Seu teste grátis termina hoje.'}
            </span>
            <Link
              href="/admin/settings/planos"
              className="font-semibold underline-offset-2 hover:underline"
            >
              Escolher plano
            </Link>
          </div>
        ) : null}
        {children}
      </main>

      <PlanRestrictionModal
        open={showRestrictionModal}
        storeName={storeAccess?.name || user.store?.name}
        storeSlug={storeAccess?.slug || user.store?.slug}
        status={storeAccess?.status}
        planDueAt={storeAccess?.planDueAt}
      />
    </div>
  );
}
