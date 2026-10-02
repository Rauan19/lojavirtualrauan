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
  /** Proporção real da arte: sem isso o container corta a imagem no desktop. */
  const [ratio, setRatio] = useState<number | null>(null);
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
      style={
        ratio ? ({ '--promo-ratio': String(ratio) } as React.CSSProperties) : undefined
      }
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
            className="store-promo-carousel-slide relative overflow-hidden"
            aria-hidden={i !== index}
          >
            {/*
              Fundo: a própria arte ampliada e desfocada, só para preencher a
              sobra quando a proporção do banner não é a da imagem.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
              draggable={false}
            />
            {/* Arte real: inteira, sem corte. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="relative h-full w-full object-contain"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
              onLoad={(e) => {
                // A primeira arte define a proporção do carrossel inteiro.
                if (i !== 0 || ratio) return;
                const el = e.currentTarget;
                if (el.naturalWidth && el.naturalHeight) {
                  setRatio(el.naturalWidth / el.naturalHeight);
                }
              }}
            />
          </div>
        ))}
      </div>

      {total > 1 ? (
        <>
          {/* Controles juntos, numa pílula embaixo e ao centro (tema Dawn) */}
          <div className="absolute inset-x-0 bottom-2 flex justify-center sm:bottom-3 md:bottom-5">
            <div className="flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-1.5 text-ink shadow-[0_6px_18px_-8px_rgba(0,0,0,0.45)] sm:px-1 sm:py-1">
              <button
                type="button"
                aria-label="Banner anterior"
                onClick={() => go(index - 1)}
                className="hidden h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5 sm:flex"
              >
                <ChevronLeft />
              </button>
              <div className="flex items-center gap-1.5 px-1">
                {urls.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Ir para o banner ${i + 1}`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className={`h-2 rounded-full transition-[width,background-color] ${
                      i === index ? 'w-6 bg-[#171a1f]' : 'w-2 bg-[#171a1f]/25 hover:bg-[#171a1f]/45'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Próximo banner"
                onClick={() => go(index + 1)}
                className="hidden h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5 sm:flex"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
