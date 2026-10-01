'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, mediaUrl, money } from '@/lib/api';
import type { CartItem } from '@/lib/cart';

type Sugestao = {
  id: string;
  name: string;
  slug: string;
  price: string;
  installments?: number | null;
  hasVariants: boolean;
  images: { url: string }[];
};

/**
 * "Compre junto" na página do produto: o que o lojista escolheu para levar
 * com este, já marcado, e um botão que põe tudo na sacola. Produto com
 * opções (tamanho, cor) não entra no clique: leva à página dele para
 * escolher.
 */
export function CompreJunto({
  storeSlug,
  idOrSlug,
  principal,
  onAdicionar,
}: {
  storeSlug: string;
  idOrSlug: string;
  /** Este produto: nome, foto e preço da opção escolhida. */
  principal: { name: string; price: number; image?: string | null };
  /**
   * Põe os itens na sacola. Recebe as sugestões marcadas; devolve false
   * quando este produto ainda precisa de opção (tamanho, cor).
   */
  onAdicionar: (extras: Omit<CartItem, 'quantity'>[]) => boolean;
}) {
  const [itens, setItens] = useState<Sugestao[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let vivo = true;
    api<{ items: Sugestao[]; descontoPct?: number }>(
      `/catalog/products/${idOrSlug}/compre-junto`,
      { storeSlug },
    )
      .then((r) => {
        if (!vivo) return;
        setItens(r.items);
        setPct(r.descontoPct ?? 0);
        setMarcados(
          new Set(r.items.filter((i) => !i.hasVariants).map((i) => i.id)),
        );
      })
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [storeSlug, idOrSlug]);

  if (itens.length === 0) return null;

  const escolhidos = itens.filter((i) => marcados.has(i.id) && !i.hasVariants);
  // Mesma conta do servidor: centavos, arredondando para baixo
  const comDesconto = (preco: number) =>
    (Math.round(preco * 100) -
      Math.floor((Math.round(preco * 100) * pct) / 100)) /
    100;
  const total =
    principal.price +
    escolhidos.reduce((s, i) => s + comDesconto(Number(i.price)), 0);

  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function adicionar() {
    onAdicionar(
      escolhidos.map((i) => ({
        productId: i.id,
        name: i.name,
        price: Number(i.price),
        image: i.images[0]?.url || null,
        installmentsFree: i.installments ?? null,
      })),
    );
  }

  const foto = (url?: string | null) => mediaUrl(url) ?? undefined;

  return (
    <section className="mt-8 border border-line px-3 py-4 sm:px-4">
      <h2 className="text-sm font-bold">
        Compre junto
        {pct > 0 ? (
          <span className="ml-2 rounded-full bg-[#f0fbf3] px-2 py-0.5 text-[11px] font-bold text-[#166534]">
            {pct}% off levando junto
          </span>
        ) : null}
      </h2>
      <ul className="mt-3 space-y-2">
        <li className="flex items-center gap-3">
          <span className="w-4 shrink-0" aria-hidden />
          <Miniatura src={foto(principal.image)} alt={principal.name} />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[13px]">
              {principal.name}{' '}
              <span className="text-muted">(este produto)</span>
            </span>
          </span>
          <strong className="shrink-0 text-[13px]">
            {money(principal.price)}
          </strong>
        </li>
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-3">
            {i.hasVariants ? (
              <span className="w-4 shrink-0 text-center text-muted" aria-hidden>
                +
              </span>
            ) : (
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={marcados.has(i.id)}
                onChange={() => alternar(i.id)}
                aria-label={`Levar ${i.name} junto`}
              />
            )}
            <Link href={`/loja/${storeSlug}/p/${i.slug || i.id}`}>
              <Miniatura src={foto(i.images[0]?.url)} alt={i.name} />
            </Link>
            <span className="min-w-0 flex-1">
              <Link
                href={`/loja/${storeSlug}/p/${i.slug || i.id}`}
                className="line-clamp-2 text-[13px] hover:underline"
              >
                {i.name}
              </Link>
              {i.hasVariants ? (
                <Link
                  href={`/loja/${storeSlug}/p/${i.slug || i.id}`}
                  className="text-[12px] font-semibold underline"
                >
                  Escolher opções
                </Link>
              ) : null}
            </span>
            <span className="shrink-0 text-right text-[13px]">
              {pct > 0 && !i.hasVariants ? (
                <>
                  <s className="block text-[11px] text-muted">
                    {money(Number(i.price))}
                  </s>
                  <strong>{money(comDesconto(Number(i.price)))}</strong>
                </>
              ) : (
                <strong>{money(Number(i.price))}</strong>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm">
          {escolhidos.length + 1} itens por{' '}
          <strong className="text-base">{money(total)}</strong>
        </p>
        <button
          type="button"
          className="btn btn-accent h-11"
          onClick={adicionar}
          disabled={escolhidos.length === 0}
        >
          Adicionar {escolhidos.length + 1} à sacola
        </button>
      </div>
    </section>
  );
}

function Miniatura({ src, alt }: { src?: string; alt: string }) {
  return (
    <span className="block h-14 w-14 shrink-0 overflow-hidden bg-[#f3f3f3]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}
