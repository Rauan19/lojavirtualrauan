'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * A vitrine de verdade, em miniatura: a página é desenhada no tamanho real
 * (1280px no computador, 390px no celular) dentro de um iframe e reduzida
 * por transform. É o que a Shopify faz no "tema atual": o lojista vê a loja
 * dele, não um desenho. Só para olhar (sem clique nem foco).
 */
export function LojaAoVivo({
  src,
  largura,
  altura,
  titulo,
}: {
  src: string;
  /** Largura em que a vitrine é desenhada antes de reduzir */
  largura: number;
  /** Altura visível, na escala real */
  altura: number;
  titulo: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / largura);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [largura]);

  return (
    <div
      ref={caixa}
      className="relative w-full overflow-hidden bg-white"
      style={{
        height: escala ? altura * escala : undefined,
        aspectRatio: escala ? undefined : `${largura} / ${altura}`,
      }}
    >
      {escala ? (
        <iframe
          src={src}
          title={titulo}
          loading="lazy"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: largura,
            height: altura,
            transform: `scale(${escala})`,
          }}
        />
      ) : null}
    </div>
  );
}
