'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from '@/lib/api';

type Props = {
  images: string[];
  storeName?: string;
  /** Tempo entre trocas automáticas (ms). 0 desliga o auto-play. */
  intervalMs?: number;
};

function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Carrossel de banners da loja: passa sozinho, mas o cliente pode assumir o
 * controle pelas setas, pelos indicadores ou arrastando no celular. Auto-play
 * pausa no hover e quando o visitante navega manualmente.
 */
export function StoreMarquee({ images, storeName, intervalMs = 5000 }: Props) {
  const urls = images.map((src) => mediaUrl(src)).filter(Boolean) as string[];
  const total = urls.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  useEffect(() => {
    if (paused || total <= 1 || intervalMs <= 0) return;
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced) return;

    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [paused, total, intervalMs]);

  if (total === 0) return null;

  return (
    <section
      className="store-promo-marquee relative w-full overflow-hidden bg-[#111]"
      aria-roledescription="carrossel"
      aria-label={storeName ? `Promoções ${storeName}` : 'Promoções'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchStartX.current = null;
        setPaused(false);
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        go(delta < 0 ? index + 1 : index - 1);
      }}
    >
      <div
        className="store-promo-carousel-track"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {urls.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="store-promo-carousel-slide"
            aria-hidden={i !== index}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Banner anterior"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-[2px] transition-colors hover:bg-black/55 md:left-4 md:h-11 md:w-11"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Próximo banner"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-[2px] transition-colors hover:bg-black/55 md:right-4 md:h-11 md:w-11"
          >
            <ChevronRight />
          </button>

          <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 md:bottom-4">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para o banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
