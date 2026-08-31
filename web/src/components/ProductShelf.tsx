'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { StarRating } from '@/components/StarRating';
import { api, mediaUrl, money } from '@/lib/api';

export type ShelfProduct = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  price: string;
  compareAt?: string | null;
  installments?: number | null;
  rating?: { avg: number; count: number } | null;
  images: { url: string }[];
};

type Props = {
  storeSlug: string;
  title: string;
  /** Filtros da vitrine, ex.: `onSale=true` ou `sort=newest`. */
  query: string;
  /** Rótulo do link que leva ao catálogo com o mesmo filtro. */
  seeAllHref?: string;
  storeName: string;
  limit?: number;
};

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Prateleira horizontal — o formato de vitrine curada que lojas grandes usam
 * na home, em vez de jogar o catálogo inteiro num grid só.
 */
export function ProductShelf({
  storeSlug,
  title,
  query,
  seeAllHref,
  storeName,
  limit = 12,
}: Props) {
  const [items, setItems] = useState<ShelfProduct[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    api<{ items: ShelfProduct[] }>(`/catalog/products?${query}&limit=${limit}`, {
      storeSlug,
    })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [storeSlug, query, limit]);

  function syncArrows() {
    const el = trackRef.current;
    if (!el) return;
    setCanScroll({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    });
  }

  useEffect(() => {
    syncArrows();
  }, [items]);

  function slide(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  }

  // Vitrine sem produto não vira espaço vazio na home: simplesmente não existe
  if (items !== null && items.length === 0) return null;

  return (
    <section className="border-b border-line bg-white py-5 md:py-7">
      <div className="mx-auto max-w-[1200px] px-3 md:px-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-tight text-ink md:text-[20px]">
            {title}
          </h2>
          <div className="flex items-center gap-1.5">
            {seeAllHref ? (
              <Link
                href={seeAllHref}
                className="text-[13px] font-semibold text-[var(--store-accent)] underline-offset-4 hover:underline"
              >
                Ver todos
              </Link>
            ) : null}
            <div className="hidden items-center gap-1 md:flex">
              <button
                type="button"
                aria-label="Anterior"
                onClick={() => slide(-1)}
                disabled={!canScroll.left}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition enabled:hover:bg-[#f7f8fa] disabled:opacity-30"
              >
                <Arrow dir="left" />
              </button>
              <button
                type="button"
                aria-label="Próximo"
                onClick={() => slide(1)}
                disabled={!canScroll.right}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition enabled:hover:bg-[#f7f8fa] disabled:opacity-30"
              >
                <Arrow dir="right" />
              </button>
            </div>
          </div>
        </div>

        {items === null ? (
          <div className="no-scrollbar flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[164px] shrink-0 animate-pulse md:w-[186px]">
                <div className="store-card-media bg-[#ececec]" />
                <div className="mt-2 h-3 w-4/5 bg-[#ececec]" />
                <div className="mt-2 h-4 w-1/2 bg-[#ececec]" />
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={trackRef}
            onScroll={syncArrows}
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
          >
            {items.map((p) => {
              const img = mediaUrl(p.images[0]?.url);
              const price = Number(p.price);
              const compare = p.compareAt ? Number(p.compareAt) : null;
              const off =
                compare && compare > price
                  ? Math.round(((compare - price) / compare) * 100)
                  : null;
              const href = `/loja/${storeSlug}/p/${p.slug || p.id}`;

              return (
                <Link
                  key={p.id}
                  href={href}
                  className="product-card group w-[164px] shrink-0 snap-start md:w-[186px]"
                >
                  <div className="relative store-card-media overflow-hidden bg-[#f3f3f3]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={p.name}
                        className="product-card-img h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    {off ? (
                      <span
                        className="absolute left-2 top-2 px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: 'var(--store-accent)' }}
                      >
                        -{off}%
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {p.brand || storeName}
                  </p>
                  <h3 className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-snug text-ink">
                    {p.name}
                  </h3>
                  {p.rating && p.rating.count > 0 ? (
                    <div className="mt-0.5 flex items-center gap-1">
                      <StarRating value={p.rating.avg} size={11} />
                      <span className="text-[11px] text-muted">({p.rating.count})</span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    {compare && compare > price ? (
                      <span className="text-[11px] text-muted line-through">
                        {money(compare)}
                      </span>
                    ) : null}
                    <strong className="text-[15px] font-bold text-ink">{money(price)}</strong>
                  </div>
                  {p.installments && p.installments >= 2 ? (
                    <p className="text-[11px] font-semibold text-[var(--ok)]">
                      {p.installments}x sem juros
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
