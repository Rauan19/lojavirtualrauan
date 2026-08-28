'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CartDrawer } from '@/components/CartDrawer';
import { CartProvider, useCart } from '@/components/CartProvider';
import { InstallmentsBlock } from '@/components/InstallmentsBlock';
import { PaginationBar } from '@/components/PaginationBar';
import { StoreMarquee } from '@/components/StoreMarquee';
import { StoreShell } from '@/components/StoreShell';
import { StarRating } from '@/components/StarRating';
import { WishlistButton } from '@/components/WishlistButton';
import { api, mediaUrl, money } from '@/lib/api';
import { addToCart } from '@/lib/cart';
import {
  fetchInstallmentsBatch,
  type InstallmentsResponse,
} from '@/lib/installments';

type Store = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  status: string;
  marqueeEnabled?: boolean;
  marqueeImages?: string[] | null;
  freteGratisAcima?: string | number | null;
  freteModo?: string;
  sellerPhone?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

type CouponBanner = {
  code: string;
  description?: string | null;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: string | number;
} | null;

type Category = {
  id: string;
  name: string;
  slug: string;
  active?: boolean;
  imageUrl?: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  price: string;
  compareAt?: string | null;
  installments?: number | null;
  categoryId?: string | null;
  hasVariants?: boolean;
  stock?: number;
  rating?: { avg: number; count: number } | null;
  images: { url: string }[];
};

type CatalogResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_SIZE = 24;

function asImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function ProductCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col">
      <div className="aspect-[3/4] bg-[#ececec]" />
      <div className="mt-2.5 h-2.5 w-1/2 bg-[#ececec]" />
      <div className="mt-2 h-3.5 w-4/5 bg-[#ececec]" />
      <div className="mt-2 h-4 w-1/3 bg-[#ececec]" />
      <div className="mt-2.5 h-9 w-full bg-[#ececec]" />
    </div>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-white">
      <path
        d="M2.5 6.5h11v9h-11v-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 10h3.5l3.5 3v2.5h-7V10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SearchOffIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-muted">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StorefrontSkeleton() {
  return (
    <main className="min-h-screen bg-white">
      <div className="h-[var(--header-h)] animate-pulse border-b border-line bg-[#f3f3f3]" />
      <div className="mx-auto max-w-[1200px] px-3 py-3 md:px-4 md:py-4">
        <div className="mb-3 h-5 w-40 animate-pulse bg-[#ececec] md:mb-4" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function StorefrontPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <CartProvider storeSlug={slug}>
      <StorefrontInner slug={slug} />
    </CartProvider>
  );
}

function StorefrontInner({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart();
  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(
    () => searchParams.get('categoryId'),
  );
  const [sort, setSort] = useState('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [debouncedMinPrice, setDebouncedMinPrice] = useState('');
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState('');
  const [priceOpen, setPriceOpen] = useState(false);
  const priceRef = useRef<HTMLDivElement>(null);
  const [brand, setBrand] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [inStock, setInStock] = useState(false);
  const [onSale, setOnSale] = useState(false);
  const [couponBanner, setCouponBanner] = useState<CouponBanner>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [installmentsById, setInstallmentsById] = useState<
    Record<string, InstallmentsResponse>
  >({});
  const [installmentsLoading, setInstallmentsLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedMinPrice(minPrice);
      setDebouncedMaxPrice(maxPrice);
    }, 400);
    return () => clearTimeout(t);
  }, [minPrice, maxPrice]);

  useEffect(() => {
    if (!priceOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (priceRef.current && !priceRef.current.contains(e.target as Node)) {
        setPriceOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [priceOpen]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    categoryId,
    sort,
    debouncedMinPrice,
    debouncedMaxPrice,
    brand,
    inStock,
    onSale,
  ]);

  useEffect(() => {
    Promise.all([
      api<Store>(`/stores/public/${slug}`),
      api<Category[]>('/catalog/categories', { storeSlug: slug }).catch(() => []),
      api<string[]>('/catalog/brands', { storeSlug: slug }).catch(() => []),
      api<CouponBanner>('/catalog/coupon-banner', { storeSlug: slug }).catch(() => null),
    ])
      .then(([s, cats, brandList, coupon]) => {
        setStore(s);
        setCategories(Array.isArray(cats) ? cats.filter((c) => c.active !== false) : []);
        setBrands(Array.isArray(brandList) ? brandList : []);
        setCouponBanner(coupon);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Loja não encontrada'));
  }, [slug]);

  useEffect(() => {
    if (!store) return;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedQ) params.set('q', debouncedQ);
    if (categoryId) params.set('categoryId', categoryId);
    if (sort !== 'newest') params.set('sort', sort);
    if (debouncedMinPrice) params.set('minPrice', debouncedMinPrice);
    if (debouncedMaxPrice) params.set('maxPrice', debouncedMaxPrice);
    if (brand) params.set('brand', brand);
    if (inStock) params.set('inStock', 'true');
    if (onSale) params.set('onSale', 'true');

    setLoadingCatalog(true);
    api<CatalogResponse>(`/catalog/products?${params}`, { storeSlug: slug })
      .then((catalog) => {
        setProducts(catalog.items);
        setTotal(catalog.total);
        setTotalPages(catalog.totalPages || 1);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar produtos'),
      )
      .finally(() => setLoadingCatalog(false));
  }, [
    store,
    slug,
    page,
    debouncedQ,
    categoryId,
    sort,
    debouncedMinPrice,
    debouncedMaxPrice,
    brand,
    inStock,
    onSale,
  ]);

  // Parcelas de todos os produtos da página numa chamada só, em vez de 1
  // request por card (cada card não busca mais sozinho — ver `preset` abaixo).
  useEffect(() => {
    if (!products.length) {
      setInstallmentsById({});
      return;
    }
    let cancelled = false;
    setInstallmentsLoading(true);
    fetchInstallmentsBatch({
      storeSlug: slug,
      items: products.map((p) => ({
        id: p.id,
        amount: Number(p.price),
        freeUntil: p.installments,
      })),
    }).then((map) => {
      if (cancelled) return;
      setInstallmentsById(map);
      setInstallmentsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [products, slug]);

  const hasActiveFilters = Boolean(
    q ||
      categoryId ||
      minPrice ||
      maxPrice ||
      sort !== 'newest' ||
      brand ||
      inStock ||
      onSale,
  );

  const activeCategoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name || null,
    [categories, categoryId],
  );

  const categoriesWithImage = useMemo(
    () => categories.filter((c) => c.imageUrl),
    [categories],
  );

  const marqueeImages = useMemo(() => {
    if (!store || store.marqueeEnabled === false) return [];
    const custom = asImageList(store.marqueeImages);
    if (custom.length > 0) return custom;
    return products
      .map((p) => p.images[0]?.url)
      .filter((u): u is string => !!u)
      .slice(0, 10);
  }, [store, products]);

  if (error && !store) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold">Loja indisponível</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      </main>
    );
  }

  if (!store) {
    return <StorefrontSkeleton />;
  }

  return (
    <>
      <StoreShell
        storeName={store.name}
        logoUrl={mediaUrl(store.logoUrl)}
        primaryColor={store.primaryColor || '#1a1a1a'}
        accentColor={store.accentColor || '#e31c5f'}
        categories={categories}
        activeCategoryId={categoryId}
        onSelectCategory={setCategoryId}
        search={q}
        onSearch={setQ}
        homeHref={`/loja/${slug}`}
        storeSlug={slug}
        sellerPhone={store.sellerPhone}
        instagramUrl={store.instagramUrl}
        facebookUrl={store.facebookUrl}
        tiktokUrl={store.tiktokUrl}
        cartCount={cart.count}
        onOpenCart={() => cart.setOpen(true)}
      >
        {marqueeImages.length > 0 ? (
          <StoreMarquee images={marqueeImages} storeName={store.name} />
        ) : null}

        {categoriesWithImage.length > 0 ? (
          <div className="border-b border-line bg-white px-3 py-4 md:px-4">
            {/*
              O filho com `w-max` + `mx-auto` centraliza a fileira quando ela
              cabe na tela e, quando não cabe, mantém o scroll horizontal sem
              cortar o primeiro item (o que `justify-center` faria).
            */}
            <div className="no-scrollbar mx-auto max-w-[1200px] overflow-x-auto">
              <div className="mx-auto flex w-max gap-4 md:gap-6">
                {categoriesWithImage.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(c.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 md:w-[92px]"
                  >
                    <span
                      className={`h-16 w-16 overflow-hidden rounded-full border-2 md:h-20 md:w-20 ${
                        categoryId === c.id
                          ? 'border-[var(--store-accent)]'
                          : 'border-transparent'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl(c.imageUrl) || undefined}
                        alt={c.name}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-medium text-ink">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {(() => {
          const freeFrom = store.freteGratisAcima
            ? Number(store.freteGratisAcima)
            : 0;
          const alwaysFree = store.freteModo === 'gratis';
          if (!alwaysFree && !(freeFrom > 0)) return null;
          return (
            <div
              className="store-free-ship relative overflow-hidden px-3 py-3.5 text-center md:px-4 md:py-4"
              style={{
                background:
                  'linear-gradient(105deg, color-mix(in srgb, var(--store-accent) 92%, #111) 0%, var(--store-accent) 100%)',
              }}
            >
              <div
                className="store-free-ship-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
                aria-hidden
              />
              <p className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-bold tracking-wide text-white md:text-[15px]">
                <span
                  className="store-free-ship-icon inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-[2px]"
                  aria-hidden
                >
                  <TruckIcon />
                </span>
                {alwaysFree ? (
                  <span className="drop-shadow-sm">
                    Frete grátis em todos os pedidos
                  </span>
                ) : (
                  <>
                    <span className="drop-shadow-sm">Frete grátis</span>
                    <span className="store-free-ship-value inline-flex items-baseline gap-1 rounded-md bg-white px-2.5 py-1 text-[var(--store-accent)] shadow-sm">
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                        acima de
                      </span>
                      <span className="text-base font-extrabold tabular-nums tracking-tight md:text-lg">
                        {money(freeFrom)}
                      </span>
                    </span>
                  </>
                )}
              </p>
            </div>
          );
        })()}

        {couponBanner ? (
          <div className="border-b border-line bg-[#171a1f] px-3 py-2.5 text-center text-[13px] font-medium text-white md:text-sm">
            {couponBanner.description ? `${couponBanner.description}: ` : 'Ganhe '}
            {couponBanner.type === 'FREE_SHIPPING'
              ? 'frete grátis'
              : couponBanner.type === 'PERCENT'
                ? `${Number(couponBanner.value)}% de desconto`
                : `${money(Number(couponBanner.value))} de desconto`}{' '}
            com o cupom{' '}
            <strong className="tracking-wide" style={{ color: 'var(--store-accent)' }}>
              {couponBanner.code}
            </strong>
          </div>
        ) : null}

        <div className="mx-auto max-w-[1200px] px-3 py-3 pb-24 md:px-4 md:py-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 md:mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">Catálogo</p>
              <h1 className="text-lg font-bold md:text-xl">
                {activeCategoryName || store.name}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted md:text-sm">
                {loadingCatalog ? 'Carregando...' : `${total} produtos`}
              </p>

              <div className="relative" ref={priceRef}>
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1.5 text-[11px]"
                  onClick={() => setPriceOpen((v) => !v)}
                >
                  Filtros
                  {minPrice || maxPrice || brand || inStock || onSale ? ' •' : ''}
                </button>
                {priceOpen ? (
                  <div className="absolute right-0 z-20 mt-1.5 w-64 space-y-3 border border-line bg-white p-3 shadow-lg">
                    <div>
                      <p className="label mb-1.5">Faixa de preço</p>
                      <div className="flex items-center gap-1.5">
                        <input
                          className="field"
                          type="number"
                          min="0"
                          inputMode="decimal"
                          placeholder="Mín"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                        />
                        <span className="text-xs text-muted">–</span>
                        <input
                          className="field"
                          type="number"
                          min="0"
                          inputMode="decimal"
                          placeholder="Máx"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                        />
                      </div>
                    </div>

                    {brands.length > 0 ? (
                      <div>
                        <p className="label mb-1.5">Marca</p>
                        <select
                          className="field"
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {brands.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={inStock}
                        onChange={(e) => setInStock(e.target.checked)}
                      />
                      Só em estoque
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onSale}
                        onChange={(e) => setOnSale(e.target.checked)}
                      />
                      Só com desconto
                    </label>

                    {minPrice || maxPrice || brand || inStock || onSale ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                        onClick={() => {
                          setMinPrice('');
                          setMaxPrice('');
                          setBrand('');
                          setInStock(false);
                          setOnSale(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <select
                className="field h-8 w-auto rounded-none py-0 pr-6 text-[11px]"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Ordenar por"
              >
                <option value="newest">Novidades</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="name_asc">Nome A-Z</option>
              </select>
            </div>
          </div>

          {products.length === 0 && loadingCatalog ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border border-dashed border-line px-4 py-16 text-center">
              <SearchOffIcon />
              <p className="text-sm font-semibold text-ink">Nenhum produto encontrado</p>
              <p className="max-w-[32ch] text-xs text-muted">
                {debouncedQ
                  ? `Sem resultados para "${debouncedQ}".`
                  : 'Tente outra categoria ou faixa de preço.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="btn btn-ghost mt-1 px-3 py-1.5 text-xs"
                  onClick={() => {
                    setQ('');
                    setCategoryId(null);
                    setMinPrice('');
                    setMaxPrice('');
                    setSort('newest');
                    setBrand('');
                    setInStock(false);
                    setOnSale(false);
                  }}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className={`grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${
                loadingCatalog ? 'opacity-50' : 'opacity-100'
              }`}
            >
              {products.map((p) => {
                const img = mediaUrl(p.images[0]?.url);
                const price = Number(p.price);
                const compare = p.compareAt ? Number(p.compareAt) : null;
                const discount =
                  compare && compare > price
                    ? Math.round(((compare - price) / compare) * 100)
                    : null;
                const href = `/loja/${slug}/p/${p.slug || p.id}`;

                return (
                  <article key={p.id} className="product-card group flex flex-col">
                    <Link href={href} className="relative aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={p.name}
                          className="product-card-img h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-muted">
                          Sem imagem
                        </div>
                      )}
                      {discount ? (
                        <span
                          className="absolute left-2 top-2 px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: 'var(--store-accent)' }}
                        >
                          -{discount}%
                        </span>
                      ) : null}
                      {p.stock != null && p.stock > 0 && p.stock <= 5 ? (
                        <span className="absolute bottom-2 left-2 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Só {p.stock} un.
                        </span>
                      ) : null}
                      <WishlistButton
                        storeSlug={slug}
                        productId={p.id}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm"
                      />
                    </Link>
                    <div className="flex flex-1 flex-col space-y-1 pt-2.5">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {p.brand || store.name}
                      </p>
                      <Link href={href}>
                        <h2 className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-snug text-ink md:text-[14px]">
                          {p.name}
                        </h2>
                      </Link>
                      {p.rating && p.rating.count > 0 ? (
                        <div className="flex items-center gap-1">
                          <StarRating value={p.rating.avg} size={11} />
                          <span className="text-[11px] text-muted">({p.rating.count})</span>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-baseline gap-1.5 pt-0.5">
                        {compare && compare > price ? (
                          <span className="text-[11px] text-muted line-through">
                            {money(compare)}
                          </span>
                        ) : null}
                        <strong className="text-[15px] font-bold text-ink md:text-base">
                          {money(price)}
                        </strong>
                      </div>
                      <InstallmentsBlock
                        amount={price}
                        storeSlug={slug}
                        interestFreeMax={p.installments}
                        variant="compact"
                        preset={installmentsById[p.id] ?? null}
                        presetLoading={installmentsLoading}
                      />
                      <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2.5">
                        <button
                          type="button"
                          className="btn btn-ghost h-10 px-1 text-[11px]"
                          onClick={() => {
                            if (p.hasVariants) {
                              router.push(`/loja/${slug}/p/${p.slug || p.id}`);
                              return;
                            }
                            cart.add({
                              productId: p.id,
                              name: p.name,
                              price,
                              image: p.images[0]?.url || null,
                              installmentsFree: p.installments ?? null,
                            });
                          }}
                        >
                          {p.hasVariants ? 'Opções' : 'Adicionar'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-accent h-10 px-1 text-[11px]"
                          onClick={() => {
                            if (p.hasVariants) {
                              router.push(`/loja/${slug}/p/${p.slug || p.id}`);
                              return;
                            }
                            addToCart(slug, {
                              productId: p.id,
                              name: p.name,
                              price,
                              image: p.images[0]?.url || null,
                              installmentsFree: p.installments ?? null,
                            });
                            router.push(`/loja/${slug}/checkout`);
                          }}
                        >
                          Comprar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <PaginationBar
            className="mt-5"
            page={page}
            totalPages={totalPages}
            total={total}
            label="produtos"
            onPageChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      </StoreShell>
      <CartDrawer checkoutHref={`/loja/${slug}/checkout`} />
    </>
  );
}
