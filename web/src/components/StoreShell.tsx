'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/CustomerProvider';
import { CookieConsent } from '@/components/CookieConsent';
import { PaymentBadges } from '@/components/PaymentBadges';
import { api, mediaUrl, money } from '@/lib/api';
import { cardRatioValue, fontStyle } from '@/lib/store-theme';
import { sellerWhatsappHref } from '@/lib/contact';

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  price: string;
  images: { url: string }[];
};

type Props = {
  storeName: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  categories?: {
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
  }[];
  activeCategoryId?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;
  search: string;
  onSearch: (value: string) => void;
  homeHref?: string;
  accountHref?: string;
  storeSlug?: string;
  sellerPhone?: string | null;
  legalName?: string | null;
  sellerDocument?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  storeFont?: string | null;
  storeCardRatio?: string | null;
  analyticsGaId?: string | null;
  analyticsPixelId?: string | null;
  cartCount?: number;
  onOpenCart?: () => void;
};

function formatCnpj(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WhatsappIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.1.55 4.06 1.6 5.79L2 22l4.44-1.68a9.85 9.85 0 005.6 1.72h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.16h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-2.63 1 .7-2.56-.2-.31a8.17 8.17 0 01-1.25-4.36c0-4.53 3.7-8.22 8.24-8.22a8.2 8.2 0 018.23 8.23c0 4.53-3.69 8.22-8.22 8.22z" />
    </svg>
  );
}

function firstName(full?: string | null) {
  if (!full?.trim()) return '';
  return full.trim().split(/\s+/)[0];
}

export function StoreShell({
  storeName,
  logoUrl,
  primaryColor,
  accentColor,
  storeFont,
  storeCardRatio,
  analyticsGaId,
  analyticsPixelId,
  categories = [],
  activeCategoryId = null,
  onSelectCategory,
  search,
  onSearch,
  homeHref = '#',
  accountHref,
  storeSlug,
  sellerPhone,
  legalName,
  sellerDocument,
  sellerCity,
  sellerState,
  instagramUrl,
  facebookUrl,
  tiktokUrl,
  cartCount = 0,
  onOpenCart,
  children,
}: Props & { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [megaId, setMegaId] = useState<string | null>(null);
  const [megaCache, setMegaCache] = useState<Record<string, Suggestion[]>>({});
  const megaTimer = useRef<number | undefined>(undefined);
  const { customer, logout } = useCustomer();
  const helpWa = sellerPhone
    ? sellerWhatsappHref(sellerPhone, `Olá! Preciso de ajuda com um pedido na loja ${storeName}.`)
    : null;

  const contaHref =
    accountHref || (storeSlug ? `/loja/${storeSlug}/conta` : homeHref);
  const pedidosHref = storeSlug
    ? `/loja/${storeSlug}/conta/pedidos`
    : `${contaHref}/pedidos`;
  const loggedIn = !!customer;
  const displayName = firstName(customer?.name);

  function handleLogout() {
    logout();
    setMenuOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!storeSlug || search.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ items: Suggestion[] }>(
        `/catalog/products?q=${encodeURIComponent(search.trim())}&limit=5`,
        { storeSlug },
      )
        .then((res) => {
          if (!cancelled) setSuggestions(res.items);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, storeSlug]);

  useEffect(() => {
    if (!megaId || !storeSlug || megaCache[megaId]) return;
    let cancelled = false;
    api<{ items: Suggestion[] }>(
      `/catalog/products?categoryId=${megaId}&limit=6`,
      { storeSlug },
    )
      .then((res) => {
        if (!cancelled) setMegaCache((prev) => ({ ...prev, [megaId]: res.items }));
      })
      .catch(() => {
        if (!cancelled) setMegaCache((prev) => ({ ...prev, [megaId]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [megaId, storeSlug, megaCache]);

  useEffect(() => {
    if (!megaId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMegaId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [megaId]);

  useEffect(() => () => window.clearTimeout(megaTimer.current), []);

  // Com subcategorias cadastradas a barra mostra só os departamentos-pai;
  // sem elas, continua mostrando a lista inteira como antes.
  const hasTree = categories.some((c) => c.parentId);
  const navItems = hasTree ? categories.filter((c) => !c.parentId) : categories;

  const megaCategory = navItems.find((c) => c.id === megaId) || null;
  const megaSubs = megaId ? categories.filter((c) => c.parentId === megaId) : [];
  const megaProducts = megaId ? megaCache[megaId] : undefined;

  function openMega(id: string | null) {
    window.clearTimeout(megaTimer.current);
    if (!id) {
      setMegaId(null);
      return;
    }
    megaTimer.current = window.setTimeout(() => setMegaId(id), 140);
  }

  function closeMega() {
    window.clearTimeout(megaTimer.current);
    megaTimer.current = window.setTimeout(() => setMegaId(null), 120);
  }

  function selectCategory(id: string | null) {
    onSelectCategory?.(id);
    setMenuOpen(false);
    window.clearTimeout(megaTimer.current);
    setMegaId(null);
  }

  return (
    <div
      className="store-theme pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0"
      style={
        {
          '--store-primary': primaryColor,
          '--store-accent': accentColor,
          // Hover derivado da própria cor da loja, sem pedir um segundo campo
          // no admin.
          '--store-accent-hover': `color-mix(in srgb, ${accentColor} 86%, #000)`,
          '--store-font': fontStyle(storeFont).body,
          '--store-font-display': fontStyle(storeFont).display,
          '--store-card-ratio': cardRatioValue(storeCardRatio),
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-[var(--header-h)] max-w-[1200px] items-center gap-2 px-3 md:gap-4 md:px-4">
          <button
            type="button"
            className="icon-btn -ml-2 shrink-0 md:ml-0"
            aria-label="Abrir menu"
            title="Menu"
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>

          <Link href={homeHref} className="flex min-w-0 shrink-0 items-center gap-2 py-1">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={storeName}
                className="h-14 max-w-[200px] object-contain object-left sm:h-16 sm:max-w-[240px] md:h-20 md:max-w-[320px] lg:h-24 lg:max-w-[380px]"
              />
            ) : (
              <span
                className="truncate text-xl font-bold tracking-tight md:text-3xl"
                style={{ color: 'var(--store-primary)' }}
              >
                {storeName}
              </span>
            )}
          </Link>

          <Link
            href={
              loggedIn
                ? contaHref
                : `${contaHref}/entrar?next=${encodeURIComponent(homeHref)}`
            }
            className={`relative ml-auto flex shrink-0 items-center gap-1 py-1.5 pl-2 pr-1 text-[11px] font-semibold md:hidden ${
              loggedIn ? 'text-ink' : 'text-ink'
            }`}
            aria-label={loggedIn ? `Olá, ${displayName}` : 'Entrar ou criar conta'}
            title={loggedIn ? `Olá, ${customer?.name}` : 'Entrar ou criar conta'}
          >
            <span className="relative">
              <UserIcon />
              {loggedIn ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white"
                  style={{ background: 'var(--store-accent)' }}
                  aria-hidden
                />
              ) : null}
            </span>
            <span className={loggedIn ? 'max-w-[64px] truncate' : 'whitespace-nowrap'}>
              {loggedIn ? displayName : 'Entrar/Cadastrar'}
            </span>
          </Link>

          <div className="relative ml-auto hidden flex-1 md:mx-6 md:block md:max-w-xl">
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <input
                className="field h-10 rounded-none border-line pr-10"
                placeholder="O que você procura?"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                <SearchIcon />
              </span>
            </label>
            {suggestionsOpen && suggestions.length > 0 ? (
              <SearchSuggestions storeSlug={storeSlug} items={suggestions} />
            ) : null}
          </div>

          {storeSlug ? (
            <Link
              href={`/loja/${storeSlug}/favoritos`}
              className="ml-auto icon-btn hidden md:!inline-flex"
              aria-label="Favoritos"
              title="Favoritos"
            >
              <HeartIcon />
            </Link>
          ) : null}

          <Link
            href={
              loggedIn
                ? contaHref
                : `${contaHref}/entrar?next=${encodeURIComponent(homeHref)}`
            }
            className={`hidden max-w-[160px] items-center gap-1.5 px-2 py-1.5 text-sm md:!inline-flex ${
              storeSlug ? '' : 'ml-auto'
            } ${loggedIn ? 'text-ink' : 'icon-btn'}`}
            aria-label={loggedIn ? `Olá, ${displayName}` : 'Entrar'}
            title={loggedIn ? `Olá, ${customer?.name}` : 'Entrar'}
          >
            <UserIcon />
            {loggedIn ? (
              <span className="min-w-0 truncate font-medium">
                Olá, {displayName}
              </span>
            ) : (
              <span className="font-medium">Entrar</span>
            )}
          </Link>

          <button
            type="button"
            className="icon-btn relative hidden md:!inline-flex"
            aria-label="Sacola"
            onClick={onOpenCart}
          >
            <BagIcon />
            {cartCount > 0 ? (
              <span
                className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: 'var(--store-accent)' }}
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            ) : null}
          </button>
        </div>

        {searchOpen ? (
          <div className="border-t border-line px-3 py-2 md:hidden">
            <input
              ref={searchRef}
              className="field h-9"
              placeholder="Buscar produtos"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        ) : null}

        <nav
          className="relative hidden border-t border-line md:block"
          onMouseLeave={closeMega}
        >
          <ul className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4">
            <li onMouseEnter={() => openMega(null)}>
              <button
                type="button"
                onClick={() => selectCategory(null)}
                onFocus={() => openMega(null)}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  !activeCategoryId
                    ? 'border-[var(--store-accent)] text-[var(--store-accent)]'
                    : 'border-transparent text-ink hover:text-[var(--store-accent)]'
                }`}
              >
                Todos
              </button>
            </li>
            {navItems.map((item) => (
              <li key={item.id} onMouseEnter={() => openMega(item.id)}>
                <button
                  type="button"
                  onClick={() => selectCategory(item.id)}
                  onFocus={() => openMega(item.id)}
                  aria-expanded={megaId === item.id}
                  className={`inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    activeCategoryId === item.id || megaId === item.id
                      ? 'border-[var(--store-accent)] text-[var(--store-accent)]'
                      : 'border-transparent text-ink hover:text-[var(--store-accent)]'
                  }`}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>

          {megaCategory && (megaSubs.length > 0 || (megaProducts?.length ?? 0) > 0) ? (
            <div
              className="absolute inset-x-0 top-full z-40 border-t border-line bg-white shadow-[0_20px_40px_-26px_rgba(0,0,0,0.5)]"
              onMouseEnter={() => window.clearTimeout(megaTimer.current)}
            >
              <div className="mx-auto flex max-w-[1200px] gap-10 px-4 py-6">
                <div
                  className={
                    megaSubs.length > 0
                      ? 'min-w-0 flex-1'
                      : 'w-[180px] shrink-0'
                  }
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {megaCategory.name}
                  </p>
                  {megaSubs.length > 0 ? (
                    <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 lg:grid-cols-3">
                      {megaSubs.map((sub) => (
                        <li key={sub.id}>
                          <button
                            type="button"
                            onClick={() => selectCategory(sub.id)}
                            className="block w-full py-1 text-left text-[13px] text-ink transition-colors hover:text-[var(--store-accent)]"
                          >
                            {sub.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => selectCategory(megaCategory.id)}
                    className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--store-accent)]"
                  >
                    Ver tudo em {megaCategory.name}
                    <span aria-hidden>&rarr;</span>
                  </button>
                </div>

                {megaProducts && megaProducts.length > 0 ? (
                  <div
                    className={
                      megaSubs.length > 0
                        ? 'w-[440px] shrink-0 lg:w-[520px]'
                        : 'min-w-0 flex-1'
                    }
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Destaques
                    </p>
                    <div
                      className={`mt-3 grid gap-3 ${
                        megaSubs.length > 0 ? 'grid-cols-4' : 'grid-cols-6'
                      }`}
                    >
                      {megaProducts
                        .slice(0, megaSubs.length > 0 ? 4 : 6)
                        .map((prod) => {
                        const img = mediaUrl(prod.images?.[0]?.url);
                        return (
                          <Link
                            key={prod.id}
                            href={`/loja/${storeSlug}/p/${prod.slug || prod.id}`}
                            onClick={() => setMegaId(null)}
                            className="group block"
                          >
                            <div className="aspect-square overflow-hidden rounded-md bg-[#f3f3f3]">
                              {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={img}
                                  alt={prod.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : null}
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug">
                              {prod.name}
                            </p>
                            <strong className="text-[12px]">{money(Number(prod.price))}</strong>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </nav>
      </header>

      <div
        className={`drawer-backdrop ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <aside className={`drawer ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={storeName}
              className="h-12 max-w-[200px] object-contain object-left"
            />
          ) : (
            <strong className="text-base font-bold">{storeName}</strong>
          )}
          <button
            type="button"
            className="icon-btn shrink-0"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="border-b border-line px-4 py-3">
          {loggedIn ? (
            <div>
              <p className="text-sm font-semibold">Olá, {displayName}</p>
              <p className="mt-0.5 text-xs text-muted">{customer?.email}</p>
            </div>
          ) : (
            <Link
              href={`${contaHref}/entrar?next=${encodeURIComponent(homeHref)}`}
              className="text-sm font-semibold underline"
              onClick={() => setMenuOpen(false)}
            >
              Entrar / Criar conta
            </Link>
          )}
        </div>

        {loggedIn ? (
          <div className="border-b border-line py-1">
            <Link
              href={pedidosHref}
              className="block px-4 py-3 text-sm font-medium"
              onClick={() => setMenuOpen(false)}
            >
              Minhas compras
            </Link>
            <Link
              href={contaHref}
              className="block px-4 py-3 text-sm font-medium"
              onClick={() => setMenuOpen(false)}
            >
              Minha conta e endereços
            </Link>
          </div>
        ) : null}

        {storeSlug ? (
          <div className="border-b border-line py-1">
            <Link
              href={`/loja/${storeSlug}/favoritos`}
              className="block px-4 py-3 text-sm font-medium"
              onClick={() => setMenuOpen(false)}
            >
              Favoritos
            </Link>
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto py-2">
          <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            Categorias
          </p>
          <button
            type="button"
            className={`block w-full border-b border-line px-4 py-3 text-left text-sm font-medium ${
              !activeCategoryId ? 'text-[var(--store-accent)]' : ''
            }`}
            onClick={() => selectCategory(null)}
          >
            Todos os produtos
          </button>
          {navItems.map((item) => {
            const subs = categories.filter((c) => c.parentId === item.id);
            return (
              <div key={item.id}>
                <button
                  type="button"
                  className={`block w-full border-b border-line px-4 py-3 text-left text-sm font-medium ${
                    activeCategoryId === item.id ? 'text-[var(--store-accent)]' : ''
                  }`}
                  onClick={() => selectCategory(item.id)}
                >
                  {item.name}
                </button>
                {subs.map((sub) => (
                  <button
                    type="button"
                    key={sub.id}
                    className={`block w-full border-b border-line py-2.5 pl-8 pr-4 text-left text-[13px] text-muted ${
                      activeCategoryId === sub.id ? 'text-[var(--store-accent)]' : ''
                    }`}
                    onClick={() => selectCategory(sub.id)}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-4">
          {loggedIn ? (
            <button
              type="button"
              className="w-full border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-bold text-white"
              onClick={handleLogout}
            >
              Sair da conta
            </button>
          ) : (
            <p className="text-xs text-muted">Frete · Trocas · Atendimento</p>
          )}
        </div>
      </aside>

      {children}

      <footer className="mt-10 border-t border-line bg-[#fafafa] pb-2 md:pb-0">
        <div className="mx-auto max-w-[1200px] px-4 py-9">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider">Institucional</p>
              <ul className="space-y-2 text-sm text-muted">
                {storeSlug ? (
                  <>
                    <li>
                      <Link href={`/loja/${storeSlug}/politicas/termos`} className="hover:text-ink">
                        Termos de uso
                      </Link>
                    </li>
                    <li>
                      <Link href={`/loja/${storeSlug}/politicas/trocas`} className="hover:text-ink">
                        Trocas e devoluções
                      </Link>
                    </li>
                    <li>
                      <Link href={`/loja/${storeSlug}/politicas/privacidade`} className="hover:text-ink">
                        Política de privacidade
                      </Link>
                    </li>
                  </>
                ) : null}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider">Minha conta</p>
              <ul className="space-y-2 text-sm text-muted">
                {storeSlug ? (
                  <>
                    <li>
                      <Link href={pedidosHref} className="hover:text-ink">
                        Meus pedidos
                      </Link>
                    </li>
                    <li>
                      <Link href={contaHref} className="hover:text-ink">
                        Dados e endereços
                      </Link>
                    </li>
                    <li>
                      <Link href={`/loja/${storeSlug}/favoritos`} className="hover:text-ink">
                        Favoritos
                      </Link>
                    </li>
                  </>
                ) : null}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider">Atendimento</p>
              <ul className="space-y-2 text-sm text-muted">
                <li>
                  {helpWa ? (
                    <a
                      href={helpWa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-ink"
                    >
                      <WhatsappIcon />
                      Falar no WhatsApp
                    </a>
                  ) : (
                    'Atendimento pelos canais da loja'
                  )}
                </li>
                <li>Frete e prazo calculados pelo seu CEP</li>
                <li>Nota fiscal em todo pedido</li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider">
                Formas de pagamento
              </p>
              <PaymentBadges />

              {instagramUrl || facebookUrl || tiktokUrl ? (
                <>
                  <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider">
                    Siga a loja
                  </p>
                  <div className="flex items-center gap-2">
                    {instagramUrl ? (
                      <a
                        href={instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Instagram"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        <InstagramIcon />
                      </a>
                    ) : null}
                    {facebookUrl ? (
                      <a
                        href={facebookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Facebook"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        <FacebookIcon />
                      </a>
                    ) : null}
                    {tiktokUrl ? (
                      <a
                        href={tiktokUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="TikTok"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        <TiktokIcon />
                      </a>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Assinatura legal: razão social e CNPJ são exigidos na vitrine */}
          <div className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-[12px] leading-relaxed text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              {legalName || storeName}
              {sellerDocument ? ` · CNPJ ${formatCnpj(sellerDocument)}` : ''}
              {sellerCity && sellerState ? ` · ${sellerCity}/${sellerState}` : ''}
            </p>
            <p className="flex items-center gap-1.5">
              <LockIcon />
              Compra segura · seus dados protegidos
            </p>
          </div>
        </div>
      </footer>

      {/*
        Aviso de cookies: o próprio componente decide se aparece — sem medição
        configurada na loja, não há o que consentir.
      */}
      {storeSlug ? (
        <CookieConsent
          storeSlug={storeSlug}
          gaId={analyticsGaId}
          pixelId={analyticsPixelId}
        />
      ) : null}

      {/* Navegação mobile inferior */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Menu principal"
      >
        <ul className="grid h-14 grid-cols-5">
          <li>
            <Link
              href={homeHref}
              className="flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-ink"
            >
              <HomeIcon />
              Início
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-ink"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <SearchIcon />
              Buscar
            </button>
          </li>
          <li>
            {storeSlug ? (
              <Link
                href={`/loja/${storeSlug}/favoritos`}
                className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-ink"
              >
                <HeartIcon />
                Favoritos
              </Link>
            ) : null}
          </li>
          <li>
            <Link
              href={
                loggedIn
                  ? pedidosHref
                  : `${contaHref}/entrar?next=${encodeURIComponent(pedidosHref)}`
              }
              className="flex h-full max-w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium text-ink"
            >
              <OrdersIcon />
              <span className="max-w-full truncate">Compras</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-ink"
              onClick={onOpenCart}
            >
              <span className="relative">
                <BagIcon />
                {cartCount > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                    style={{ background: 'var(--store-accent)' }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                ) : null}
              </span>
              Sacola
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchSuggestions({
  storeSlug,
  items,
}: {
  storeSlug?: string;
  items: Suggestion[];
}) {
  if (!storeSlug) return null;
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-line bg-white shadow-lg">
      {items.map((p) => {
        const img = mediaUrl(p.images[0]?.url);
        return (
          <Link
            key={p.id}
            href={`/loja/${storeSlug}/p/${p.slug || p.id}`}
            className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0 hover:bg-[#f7f8fa]"
          >
            <div className="h-10 w-8 shrink-0 overflow-hidden bg-[#f3f3f3]">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <strong className="shrink-0 text-xs">{money(Number(p.price))}</strong>
          </Link>
        );
      })}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 8.5h2V5.3c-.35-.05-1.55-.15-2.96-.15-2.93 0-4.94 1.79-4.94 5.08v2.77H5.2v3.6h2.9V21h3.7v-4.4h2.78l.44-3.6h-3.22v-2.4c0-1.04.28-1.76 1.8-1.76z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 3.5c.4 2.1 1.8 3.5 4 3.7v2.6c-1.5 0-2.9-.5-4-1.4v6.4a5 5 0 11-5-5c.3 0 .6 0 .9.08v2.6a2.4 2.4 0 102 2.36V3.5h2.1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20.2l-1.4-1.3C5.6 14.6 3 12.3 3 9.3 3 6.9 4.9 5 7.3 5c1.4 0 2.7.7 3.5 1.7.8-1 2.1-1.7 3.5-1.7C16.7 5 18.6 6.9 18.6 9.3c0 3-2.6 5.3-7.6 9.6L12 20.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 8.5h11l-.8 10.2a1.5 1.5 0 01-1.5 1.3H8.8a1.5 1.5 0 01-1.5-1.3L6.5 8.5z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9 8.5V7a3 3 0 016 0v1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h10a1 1 0 011 1v15l-3.2-2-2.8 2-2.8-2L6 20V5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
