'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * Prévia em tela cheia, como o "Visualizar" de temas da Shopify: a loja do
 * lojista com o template aplicado (sem salvar), alternando computador e
 * celular, com o botão de aplicar à mão. Esc ou o X fecham.
 */
export function PreviaTemplate({
  nome,
  src,
  acao,
  onFechar,
}: {
  nome: string;
  src: string;
  /** Botão da direita: "Usar este template", "Ver planos"... */
  acao: React.ReactNode;
  onFechar: () => void;
}) {
  const [aparelho, setAparelho] = useState<'computador' | 'celular'>(
    'computador',
  );
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current();
    };
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-[#1d2125]"
      role="dialog"
      aria-modal="true"
      aria-label={`Prévia do template ${nome}`}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#111417] px-3 text-white md:px-5">
        <button
          type="button"
          onClick={onFechar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Fechar prévia"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-white/60">Prévia · nada é salvo</p>
          <p className="truncate text-[15px] font-bold">{nome}</p>
        </div>
        <div
          className="hidden rounded-lg bg-white/10 p-1 sm:flex"
          role="group"
          aria-label="Tamanho da tela"
        >
          {(
            [
              ['computador', 'Computador'],
              ['celular', 'Celular'],
            ] as const
          ).map(([k, rotulo]) => (
            <button
              key={k}
              type="button"
              aria-pressed={aparelho === k}
              onClick={() => setAparelho(k)}
              className={`h-8 rounded-md px-3 text-[13px] font-semibold ${
                aparelho === k
                  ? 'bg-white text-[#111417]'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="shrink-0">{acao}</div>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-0 sm:p-5">
        <iframe
          key={aparelho}
          src={src}
          title={`Loja com o template ${nome}`}
          className={`h-full border-0 bg-white ${
            aparelho === 'celular'
              ? 'w-full sm:h-[min(844px,100%)] sm:w-[390px] sm:rounded-[28px] sm:shadow-[0_0_0_10px_#0b0d0f]'
              : 'w-full sm:rounded-lg'
          }`}
        />
      </div>
    </div>
  );
}
