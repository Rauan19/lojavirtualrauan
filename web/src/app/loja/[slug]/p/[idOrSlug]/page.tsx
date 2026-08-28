'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CartDrawer } from '@/components/CartDrawer';
import { CartProvider, useCart } from '@/components/CartProvider';
import { InstallmentsBlock } from '@/components/InstallmentsBlock';
import { PaymentBadges } from '@/components/PaymentBadges';
import { ProductReviews } from '@/components/ProductReviews';
import { StarRating } from '@/components/StarRating';
import { StoreShell } from '@/components/StoreShell';
import { WishlistButton } from '@/components/WishlistButton';
import { api, mediaUrl, money } from '@/lib/api';
import { addToCart } from '@/lib/cart';
import { sellerWhatsappHref } from '@/lib/contact';
import { getRecentlyViewed, pushRecentlyViewed, type RecentProduct } from '@/lib/recently-viewed';

type Store = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  sellerPhone?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};

type ProductVariant = {
  id: string;
  label: string;
  options: Record<string, string>;
  stock: number;
  sku?: string | null;
  barcode?: string | null;
  price?: string | number | null;
  active?: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  brand?: string | null;
  price: string;
  compareAt?: string | null;
  installments?: number | null;
  stock: number;
  hasVariants?: boolean;
  variants?: ProductVariant[];
  images: { id?: string; url: string; position?: number }[];
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  rating?: { avg: number; count: number } | null;
};

type RelatedProduct = {
  id: string;
  name: string;
  slug: string;
  price: string;
  images: { url: string }[];
};

export default function ProductPage() {
  const params = useParams<{ slug: string; idOrSlug: string }>();
  return (
    <CartProvider storeSlug={params.slug}>
      <ProductInner storeSlug={params.slug} idOrSlug={params.idOrSlug} />
    </CartProvider>
  );
}

function ProductInner({
  storeSlug,
  idOrSlug,
}: {
  storeSlug: string;
  idOrSlug: string;
}) {
  const router = useRouter();
  const cart = useCart();
  const [store, setStore] = useState<Store | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [variantHint, setVariantHint] = useState('');
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [recent, setRecent] = useState<RecentProduct[]>([]);
  const [shared, setShared] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Store>(`/stores/public/${storeSlug}`),
      api<Product>(`/catalog/products/${idOrSlug}`, { storeSlug }),
    ])
      .then(([s, p]) => {
        setStore(s);
        setProduct(p);
        setIndex(0);
        setSelected({});
        setVariantHint('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Produto não encontrado'));
  }, [storeSlug, idOrSlug]);

  useEffect(() => {
    if (!product) return;
    pushRecentlyViewed(storeSlug, {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: Number(product.price),
      image: product.images[0]?.url || null,
    });
    setRecent(getRecentlyViewed(storeSlug, product.id));
  }, [storeSlug, product]);

  useEffect(() => {
    if (!product?.categoryId) {
      setRelated([]);
      return;
    }
    api<{ items: RelatedProduct[] }>(
      `/catalog/products?categoryId=${product.categoryId}&limit=7`,
      { storeSlug },
    )
      .then((res) => setRelated(res.items.filter((p) => p.id !== product.id).slice(0, 6)))
      .catch(() => setRelated([]));
  }, [storeSlug, product]);

  const activeVariants = useMemo(
    () =>
      (product?.variants || []).filter(
        (v) => v.active !== false && v.stock >= 0,
      ),
    [product],
  );

  const hasVariants = Boolean(
    product?.hasVariants || activeVariants.length > 0,
  );

  const axes = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of activeVariants) {
      const opts = v.options || {};
      for (const [k, val] of Object.entries(opts)) {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k)!.add(val);
      }
    }
    const labelFor = (key: string) => {
      const known: Record<string, string> = {
        size: 'Tamanho',
        color: 'Cor',
        volume: 'Volume',
        weight: 'Peso',
        opcao: 'Opção',
      };
      if (known[key]) return known[key];
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };
    return Array.from(map.entries()).map(([key, values]) => ({
      key,
      label: labelFor(key),
      options: Array.from(values),
    }));
  }, [activeVariants]);

  const selectedVariant = useMemo(() => {
    if (!hasVariants || axes.length === 0) return null;
    if (axes.some((a) => !selected[a.key])) return null;
    return (
      activeVariants.find((v) =>
        axes.every((a) => (v.options || {})[a.key] === selected[a.key]),
      ) || null
    );
  }, [activeVariants, axes, hasVariants, selected]);

  function isOptionAvailable(axisKey: string, option: string) {
    const trial = { ...selected, [axisKey]: option };
    return activeVariants.some((v) => {
      if ((v.options || {})[axisKey] !== option) return false;
      if (v.stock <= 0) return false;
      return Object.entries(trial).every(([k, val]) => {
        if (k === axisKey) return true;
        if (!val) return true;
        return (v.options || {})[k] === val;
      });
    });
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-sm p-5 text-center">
          <h1 className="text-lg font-bold">Produto indisponível</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Link href={`/loja/${storeSlug}`} className="btn btn-accent mt-4 inline-flex">
            Voltar à loja
          </Link>
        </div>
      </main>
    );
  }

  if (!store || !product) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  const images = product.images?.length
    ? [...product.images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const current = images[index];
  const currentUrl = mediaUrl(current?.url);
  const basePrice = Number(product.price);
  const variantPrice =
    selectedVariant?.price != null && selectedVariant.price !== ''
      ? Number(selectedVariant.price)
      : null;
  const price =
    variantPrice != null && !Number.isNaN(variantPrice)
      ? variantPrice
      : basePrice;
  const compare = product.compareAt ? Number(product.compareAt) : null;
  const discount =
    compare && compare > price
      ? Math.round(((compare - price) / compare) * 100)
      : null;

  const displayStock = hasVariants
    ? selectedVariant
      ? selectedVariant.stock
      : activeVariants.reduce((s, v) => s + Math.max(0, v.stock), 0)
    : product.stock;

  const canAdd = hasVariants
    ? Boolean(selectedVariant && selectedVariant.stock > 0)
    : product.stock > 0;

  const sellerWa = store.sellerPhone
    ? sellerWhatsappHref(
        store.sellerPhone,
        `Olá! Vi o produto "${product.name}" na loja ${store.name} e gostaria de conversar.`,
      )
    : null;

  function go(delta: number) {
    if (images.length <= 1) return;
    setIndex((i) => (i + delta + images.length) % images.length);
  }

  function buildCartItem() {
    if (hasVariants) {
      if (!selectedVariant) {
        setVariantHint('Selecione as opções antes de adicionar');
        return null;
      }
      if (selectedVariant.stock <= 0) {
        setVariantHint('Esta combinação está esgotada');
        return null;
      }
      setVariantHint('');
      return {
        productId: product!.id,
        name: product!.name,
        price,
        image: images[0]?.url || null,
        variantId: selectedVariant.id,
        variantLabel: selectedVariant.label,
        sku: selectedVariant.sku || selectedVariant.barcode || null,
        installmentsFree: product!.installments ?? null,
      };
    }
    return {
      productId: product!.id,
      name: product!.name,
      price,
      image: images[0]?.url || null,
      installmentsFree: product!.installments ?? null,
    };
  }

  return (
    <>
      <StoreShell
        storeName={store.name}
        logoUrl={mediaUrl(store.logoUrl)}
        primaryColor={store.primaryColor || '#1a1a1a'}
        accentColor={store.accentColor || '#e31c5f'}
        search={q}
        onSearch={(value) => {
          setQ(value);
          if (value.trim()) router.push(`/loja/${storeSlug}`);
        }}
        homeHref={`/loja/${storeSlug}`}
        storeSlug={storeSlug}
        sellerPhone={store.sellerPhone}
        instagramUrl={store.instagramUrl}
        facebookUrl={store.facebookUrl}
        tiktokUrl={store.tiktokUrl}
        cartCount={cart.count}
        onOpenCart={() => cart.setOpen(true)}
      >
        <div className="mx-auto max-w-[1100px] px-3 py-4 md:px-4 md:py-6">
          <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
            <Link href={`/loja/${storeSlug}`} className="hover:text-ink">
              {store.name}
            </Link>
            {product.category ? (
              <>
                <span aria-hidden>/</span>
                <Link
                  href={`/loja/${storeSlug}?categoryId=${product.category.id}`}
                  className="hover:text-ink"
                >
                  {product.category.name}
                </Link>
              </>
            ) : null}
            <span aria-hidden>/</span>
            <span className="truncate text-ink">{product.name}</span>
          </nav>

          {/*
            Galeria mais estreita que a coluna de compra: a foto sozinha não
            fecha venda, e imagem alta demais empurra preço e botões pra fora
            da primeira dobra.
          */}
          <div className="grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:gap-10">
            <div className="md:sticky md:top-24 md:self-start">
              {/* No celular a foto é achatada de propósito: quadrada empurra
                  preço e botão pra fora da primeira tela. */}
              <div className="relative h-[260px] overflow-hidden bg-[#f3f3f3] sm:h-[340px] md:aspect-square md:h-auto md:max-h-[460px]">
                {currentUrl ? (
                  <button
                    type="button"
                    className="h-full w-full cursor-zoom-in"
                    aria-label="Ampliar imagem"
                    onClick={() => setZoomOpen(true)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentUrl}
                      alt={product.name}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted">
                    Sem imagem
                  </div>
                )}
                {discount ? (
                  <span
                    className="absolute left-2 top-2 px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ background: 'var(--store-accent)' }}
                  >
                    -{discount}%
                  </span>
                ) : null}
                <WishlistButton
                  storeSlug={storeSlug}
                  productId={product.id}
                  size={20}
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm"
                />
                {images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 px-2 py-2 text-sm font-bold"
                      aria-label="Foto anterior"
                      onClick={() => go(-1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 px-2 py-2 text-sm font-bold"
                      aria-label="Próxima foto"
                      onClick={() => go(1)}
                    >
                      ›
                    </button>
                    <span className="absolute bottom-2 right-2 bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
                      {index + 1}/{images.length}
                    </span>
                  </>
                ) : null}
              </div>

              {images.length > 1 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {images.map((img, i) => {
                    const src = mediaUrl(img.url);
                    return (
                      <button
                        key={img.id || `${img.url}-${i}`}
                        type="button"
                        className={`h-14 w-11 shrink-0 overflow-hidden border ${
                          i === index ? 'border-ink' : 'border-transparent opacity-70'
                        }`}
                        onClick={() => setIndex(i)}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {product.brand || store.name}
              </p>
              <h1 className="mt-1 text-[22px] font-bold leading-tight md:text-[28px]">
                {product.name}
              </h1>

              {product.rating && product.rating.count > 0 ? (
                <a href="#avaliacoes" className="mt-2 flex items-center gap-1.5">
                  <StarRating value={product.rating.avg} size={14} />
                  <span className="text-xs text-muted">
                    {product.rating.avg.toFixed(1)} ({product.rating.count})
                  </span>
                </a>
              ) : null}

              <div className="mt-4 flex flex-wrap items-baseline gap-2 border-t border-line pt-4">
                {compare && compare > price ? (
                  <span className="text-sm text-muted line-through">{money(compare)}</span>
                ) : null}
                <strong className="text-[30px] leading-none md:text-[34px]">
                  {money(price)}
                </strong>
                {discount ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[12px] font-bold text-white"
                    style={{ background: 'var(--store-accent)' }}
                  >
                    -{discount}%
                  </span>
                ) : null}
              </div>

              <InstallmentsBlock
                className="mt-2"
                amount={price}
                storeSlug={storeSlug}
                interestFreeMax={product.installments}
                variant="full"
              />

              {hasVariants ? (
                <div className="mt-4 space-y-3">
                  {axes.map((axis) => (
                    <div key={axis.key}>
                      <p className="label mb-1.5">{axis.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {axis.options.map((opt) => {
                          const available = isOptionAvailable(axis.key, opt);
                          const on = selected[axis.key] === opt;
                          const isColor =
                            /cor|color|acabamento/.test(axis.key) ||
                            /cor|color|acabamento/i.test(axis.label);
                          const hexMap: Record<string, string> = {
                            preto: '#1a1a1a',
                            branco: '#f4f4f4',
                            cinza: '#9ca3af',
                            azul: '#2563eb',
                            vermelho: '#dc2626',
                            verde: '#16a34a',
                            bege: '#e8d4b8',
                            rosa: '#ec4899',
                            amarelo: '#eab308',
                            marrom: '#78350f',
                            prata: '#c0c0c0',
                          };
                          const hex = isColor
                            ? hexMap[opt.trim().toLowerCase()]
                            : null;
                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={!available}
                              className={`inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium ${
                                on
                                  ? 'border-ink bg-ink text-white'
                                  : available
                                    ? 'border-line bg-white text-ink'
                                    : 'cursor-not-allowed border-line bg-[#f5f5f5] text-muted line-through'
                              }`}
                              onClick={() => {
                                setSelected((prev) => ({
                                  ...prev,
                                  [axis.key]: opt,
                                }));
                                setVariantHint('');
                              }}
                            >
                              {isColor ? (
                                <span
                                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                                  style={{
                                    backgroundColor: hex || '#d4d4d4',
                                  }}
                                  aria-hidden
                                />
                              ) : null}
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-2 text-sm text-muted">
                {hasVariants && !selectedVariant
                  ? 'Selecione as opções para ver o estoque'
                  : displayStock > 0
                    ? `${displayStock} em estoque`
                    : 'Esgotado'}
              </p>
              {variantHint ? (
                <p className="mt-1 text-sm text-accent">{variantHint}</p>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn btn-ghost h-12 text-[14px]"
                  disabled={!canAdd && !hasVariants}
                  onClick={() => {
                    const item = buildCartItem();
                    if (item) cart.add(item);
                  }}
                >
                  Adicionar à sacola
                </button>
                <button
                  type="button"
                  className="btn btn-accent h-12 text-[14px]"
                  disabled={!canAdd && !hasVariants}
                  onClick={() => {
                    const item = buildCartItem();
                    if (!item) return;
                    addToCart(storeSlug, item);
                    router.push(`/loja/${storeSlug}/checkout`);
                  }}
                >
                  Comprar agora
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {sellerWa ? (
                  <a
                    href={sellerWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost inline-flex items-center gap-1.5"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                      className="text-[#128C7E]"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Conversar com vendedor
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost inline-flex items-center gap-1.5"
                  onClick={async () => {
                    const url = window.location.href;
                    const nav = navigator as Navigator & {
                      share?: (data: { title?: string; url?: string }) => Promise<void>;
                    };
                    if (nav.share) {
                      try {
                        await nav.share({ title: product.name, url });
                        return;
                      } catch {
                        /* usuário cancelou */
                        return;
                      }
                    }
                    try {
                      await navigator.clipboard.writeText(url);
                      setShared(true);
                      setTimeout(() => setShared(false), 2000);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <ShareIcon />
                  {shared ? 'Link copiado!' : 'Compartilhar'}
                </button>
              </div>

              <PaymentBadges className="mt-4" />

              <div className="mt-6 border-t border-line pt-4">
                <h2 className="text-sm font-bold">Descrição</h2>
                {product.description?.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#333]">
                    {product.description}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">Sem descrição cadastrada.</p>
                )}
              </div>

              <div id="avaliacoes">
                <ProductReviews storeSlug={storeSlug} productId={product.id} idOrSlug={idOrSlug} />
              </div>
            </div>
          </div>

          {related.length > 0 ? (
            <section className="mt-10 border-t border-line pt-6">
              <h2 className="text-sm font-bold">Você também pode gostar</h2>
              <div className="mt-3 grid grid-cols-3 gap-x-1.5 gap-y-3 sm:grid-cols-4 md:grid-cols-6">
                {related.map((p) => (
                  <RelatedCard key={p.id} storeSlug={storeSlug} product={p} />
                ))}
              </div>
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section className="mt-10 border-t border-line pt-6">
              <h2 className="text-sm font-bold">Vistos recentemente</h2>
              <div className="mt-3 grid grid-cols-3 gap-x-1.5 gap-y-3 sm:grid-cols-4 md:grid-cols-6">
                {recent.map((p) => (
                  <RelatedCard
                    key={p.id}
                    storeSlug={storeSlug}
                    product={{ id: p.id, name: p.name, slug: p.slug, price: String(p.price), images: p.image ? [{ url: p.image }] : [] }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </StoreShell>
      <CartDrawer checkoutHref={`/loja/${storeSlug}/checkout`} />

      {zoomOpen && currentUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Fechar"
            onClick={() => setZoomOpen(false)}
          >
            ✕
          </button>
          {images.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
                aria-label="Foto anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
                aria-label="Próxima foto"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
              >
                ›
              </button>
            </>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={product.name}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function RelatedCard({
  storeSlug,
  product,
}: {
  storeSlug: string;
  product: RelatedProduct;
}) {
  const img = mediaUrl(product.images[0]?.url);
  return (
    <Link href={`/loja/${storeSlug}/p/${product.slug || product.id}`} className="flex flex-col">
      <div className="aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <h3 className="mt-1.5 line-clamp-2 text-[12px] leading-snug">{product.name}</h3>
      <strong className="mt-0.5 text-[13px]">{money(Number(product.price))}</strong>
    </Link>
  );
}
