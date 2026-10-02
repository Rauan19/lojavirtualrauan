'use client';

import { useEffect, useState } from 'react';

/**
 * Faixa fina de avisos no topo da vitrine, como nas lojas Shopify (tema Dawn)
 * e Nuvemshop. Com mais de um aviso, troca sozinha a cada poucos segundos;
 * quem pediu "menos movimento" no sistema vê só o primeiro, parado.
 */
export function FaixaAvisos({ avisos }: { avisos: string[] }) {
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (avisos.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setAtual((i) => (i + 1) % avisos.length), 4500);
    return () => clearInterval(t);
  }, [avisos.length]);

  if (avisos.length === 0) return null;

  return (
    <div
      className="faixa-avisos text-center text-[13px] font-medium"
      role="region"
      aria-label="Avisos da loja"
    >
      <p key={atual} className="faixa-avisos-texto truncate px-4 py-2" aria-live="polite">
        {avisos[atual % avisos.length]}
      </p>
    </div>
  );
}
