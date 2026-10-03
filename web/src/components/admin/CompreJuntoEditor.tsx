'use client';

import { useEffect, useState } from 'react';
import { api, mediaUrl, money } from '@/lib/api';
import { getToken } from '@/lib/auth';

type Item = {
  id: string;
  name: string;
  price: string;
  stock: number;
  active: boolean;
  images: { url: string }[];
};

const MAX = 3;

/**
 * Ficha do produto no painel: escolher até 3 produtos para o "Compre junto"
 * da vitrine. Salva a cada mudança (é uma lista curta, sem formulário).
 */
export function CompreJuntoEditor({
  productId,
  storeSlug,
}: {
  productId: string;
  storeSlug: string;
}) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Item[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [desconto, setDesconto] = useState(0);

  const opts = { token: getToken(), storeSlug };

  useEffect(() => {
    let vivo = true;
    setItens(null);
    api<{ produtos: Item[]; descontoPct: number }>(
      `/admin/products/${productId}/compre-junto`,
      { token: getToken(), storeSlug },
    )
      .then((r) => {
        if (!vivo) return;
        setItens(r.produtos);
        setDesconto(r.descontoPct ?? 0);
      })
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [productId, storeSlug]);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setAchados([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      api<{ items: Item[] }>(
        `/admin/products?q=${encodeURIComponent(termo)}&limit=6`,
        { token: getToken(), storeSlug },
      )
        .then((r) => vivo && setAchados(r.items))
        .catch(() => vivo && setAchados([]))
        .finally(() => vivo && setBuscando(false));
    }, 250);
    setBuscando(true);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busca, storeSlug]);

  async function salvar(ids: string[], pct = desconto) {
    setOcupado(true);
    setErro('');
    try {
      const r = await api<{ produtos: Item[]; descontoPct: number }>(
        `/admin/products/${productId}/compre-junto`,
        { ...opts, method: 'PUT', body: { ids, descontoPct: pct } },
      );
      setItens(r.produtos);
      setDesconto(r.descontoPct ?? 0);
      setBusca('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    } finally {
      setOcupado(false);
    }
  }

  const ids = (itens || []).map((i) => i.id);
  const opcoes = achados.filter(
    (a) => a.id !== productId && !ids.includes(a.id),
  );

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Compre junto</h3>
      <p className="mb-2 text-xs text-muted">
        Até {MAX} produtos que combinam com este. Aparecem na página do produto
        com um botão para levar tudo de uma vez.
      </p>

      {itens === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <>
          {itens.length > 0 ? (
            <ul className="mb-2 divide-y divide-line rounded ring-1 ring-line">
              {itens.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-2 py-1.5">
                  <Foto url={i.images[0]?.url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{i.name}</span>
                    <span className="text-xs text-muted">
                      {money(Number(i.price))}
                      {!i.active
                        ? ' · fora da vitrine'
                        : i.stock <= 0
                          ? ' · esgotado (não aparece)'
                          : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent hover:underline"
                    disabled={ocupado}
                    onClick={() => void salvar(ids.filter((x) => x !== i.id))}
                  >
                    Tirar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {itens.length > 0 ? (
            <label className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span>Desconto levando junto:</span>
              <select
                className="field w-auto py-1"
                value={desconto}
                disabled={ocupado}
                onChange={(e) => void salvar(ids, Number(e.target.value))}
              >
                {[0, 5, 10, 15, 20, 25, 30].map((p) => (
                  <option key={p} value={p}>
                    {p === 0 ? 'sem desconto' : `${p}% nos sugeridos`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {itens.length < MAX ? (
            <div className="relative">
              <label className="sr-only" htmlFor={`cj-busca-${productId}`}>
                Buscar produto para comprar junto
              </label>
              <input
                id={`cj-busca-${productId}`}
                className="field w-full"
                placeholder="Buscar produto pelo nome ou código"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoComplete="off"
              />
              {busca.trim().length >= 2 ? (
                <ul className="mt-1 divide-y divide-line rounded bg-white ring-1 ring-line">
                  {opcoes.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[#f6f7f9]"
                        disabled={ocupado}
                        onClick={() => void salvar([...ids, a.id])}
                      >
                        <Foto url={a.images?.[0]?.url} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {a.name}
                        </span>
                        <span className="text-xs text-muted">
                          {money(Number(a.price))}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!buscando && opcoes.length === 0 ? (
                    <li className="px-2 py-2 text-xs text-muted">
                      Nenhum produto encontrado.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
          {erro ? (
            <p role="alert" className="mt-1 text-xs text-accent">
              {erro}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Foto({ url }: { url?: string }) {
  const src = mediaUrl(url);
  return (
    <span className="block h-9 w-9 shrink-0 overflow-hidden rounded bg-[#f3f3f3]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}
