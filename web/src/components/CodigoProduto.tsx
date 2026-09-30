'use client';

import { useState } from 'react';

/**
 * "Código: VD7K3M9Q" com botão de copiar — o cliente manda o código no
 * WhatsApp da loja e o lojista acha o produto pela busca.
 */
export function CodigoProduto({
  codigo,
  className = '',
}: {
  codigo?: string | null;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!codigo) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo as string);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* navegador sem permissão de área de transferência: o código segue visível */
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted ${className}`}>
      Código:
      <span className="font-mono font-semibold tracking-wide text-ink">{codigo}</span>
      <button
        type="button"
        onClick={copiar}
        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-black/10 hover:text-ink"
        aria-label={`Copiar o código ${codigo}`}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </span>
  );
}
