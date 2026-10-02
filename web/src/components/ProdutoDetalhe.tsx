'use client';

import { useEffect, useState } from 'react';
import { CodigoProduto } from '@/components/CodigoProduto';
import { CompreJuntoEditor } from '@/components/admin/CompreJuntoEditor';
import { mediaUrl, money } from '@/lib/api';
import { useEscapeKey } from '@/lib/modal-guards';

export type ProdutoDetalheDados = {
  id: string;
  name: string;
  slug?: string;
  price: string | number;
  compareAt?: string | number | null;
  installments?: number | null;
  stock: number;
  active: boolean;
  brand?: string | null;
  sku?: string | null;
  ncm?: string | null;
  description?: string | null;
  weightKg?: string | number | null;
  widthCm?: string | number | null;
  heightCm?: string | number | null;
  lengthCm?: string | number | null;
  category?: { name: string } | null;
  images: { url: string }[];
  variants?: {
    id?: string;
    label: string;
    stock: number;
    sku?: string | null;
    barcode?: string | null;
    price?: number | string | null;
  }[];
  _count?: { orderItems?: number };
};

/**
 * Ficha do produto no painel: clicar no card abre tudo que o lojista precisa
 * ver sem entrar na edição — fotos, código, preço, estoque por variação,
 * vendas, frete e descrição. Só leitura: fecha clicando fora ou no Esc.
 */
export function ProdutoDetalhe({
  produto,
  carregando,
  storeSlug,
  onFechar,
  onEditar,
  onAlternarAtivo,
}: {
  produto: ProdutoDetalheDados;
  carregando: boolean;
  storeSlug: string;
  onFechar: () => void;
  onEditar: () => void;
  onAlternarAtivo: () => void;
}) {
  const [foto, setFoto] = useState(0);
  useEffect(() => setFoto(0), [produto.id]);
  useEscapeKey(true, onFechar);

  const preco = Number(produto.price);
  const de = produto.compareAt != null && produto.compareAt !== '' ? Number(produto.compareAt) : null;
  const imagens = produto.images || [];
  const principal = mediaUrl(imagens[foto]?.url);
  const variacoes = produto.variants || [];
  const vendas = produto._count?.orderItems;
  const medidas = [produto.widthCm, produto.heightCm, produto.lengthCm].every(
    (m) => m != null && m !== '',
  )
    ? `${Number(produto.widthCm)} × ${Number(produto.heightCm)} × ${Number(produto.lengthCm)} cm`
    : null;

  const linhas: [string, string | null][] = [
    ['Categoria', produto.category?.name || 'Sem categoria'],
    ['Marca', produto.brand || null],
    [
      'Parcelamento',
      produto.installments && produto.installments >= 2
        ? `até ${produto.installments}x sem juros`
        : 'à vista ou cartão com juros',
    ],
    ['Estoque', `${produto.stock} ${produto.stock === 1 ? 'unidade' : 'unidades'}`],
    [
      'Vendas',
      vendas == null ? null : vendas === 0 ? 'ainda não vendeu' : `em ${vendas} ${vendas === 1 ? 'pedido' : 'pedidos'}`,
    ],
    ['Peso', produto.weightKg != null && produto.weightKg !== '' ? `${Number(produto.weightKg)} kg` : null],
    ['Medidas (L × A × C)', medidas],
    ['NCM', produto.ncm || null],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="produto-detalhe-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md">
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="produto-detalhe-titulo" className="text-base font-bold leading-snug">
                {produto.name}
              </h2>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                  produto.active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-muted'
                }`}
              >
                {produto.active ? 'Na vitrine' : 'Inativo'}
              </span>
            </div>
            <CodigoProduto codigo={produto.sku} className="mt-1" />
          </div>
          <button type="button" className="btn btn-ghost shrink-0 py-1.5 text-xs" onClick={onFechar}>
            Fechar
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-2">
            <div className="aspect-square overflow-hidden rounded bg-[#eee]">
              {principal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={principal} alt={produto.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  Sem foto
                </div>
              )}
            </div>
            {imagens.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto">
                {imagens.map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setFoto(i)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded ${
                      i === foto ? 'ring-2 ring-ink' : 'ring-1 ring-line'
                    }`}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(img.url) || ''} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              {de && de > preco ? (
                <p className="text-sm text-muted line-through">{money(de)}</p>
              ) : null}
              <p className="text-2xl font-bold">{money(preco)}</p>
            </div>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {linhas
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
            </dl>

            {variacoes.length > 0 ? (
              <div>
                <h3 className="mb-1.5 text-sm font-bold">Variações</h3>
                <div className="overflow-x-auto rounded ring-1 ring-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-2 py-1.5">Variação</th>
                        <th className="px-2 py-1.5">Código</th>
                        <th className="px-2 py-1.5 text-right">Estoque</th>
                        <th className="px-2 py-1.5 text-right">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variacoes.map((v) => (
                        <tr key={v.id || v.label} className="border-t border-line">
                          <td className="px-2 py-1.5 font-medium">{v.label}</td>
                          <td className="px-2 py-1.5 font-mono">{v.sku || v.barcode || '—'}</td>
                          <td className={`px-2 py-1.5 text-right ${v.stock <= 0 ? 'font-semibold text-accent' : ''}`}>
                            {v.stock <= 0 ? 'esgotado' : v.stock}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {v.price != null && v.price !== '' ? money(Number(v.price)) : money(preco)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="mb-1 text-sm font-bold">Descrição</h3>
              {carregando ? (
                <p className="text-sm text-muted">Carregando…</p>
              ) : produto.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                  {produto.description}
                </p>
              ) : (
                <p className="text-sm text-muted">Sem descrição. Produto com descrição vende mais.</p>
              )}
            </div>

            <CompreJuntoEditor productId={produto.id} storeSlug={storeSlug} />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-ghost" onClick={onAlternarAtivo}>
            {produto.active ? 'Tirar da vitrine' : 'Colocar na vitrine'}
          </button>
          {produto.slug && produto.active ? (
            <a
              href={`/loja/${storeSlug}/p/${produto.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Ver na loja
            </a>
          ) : null}
          <button type="button" className="btn btn-accent" onClick={onEditar}>
            Editar produto
          </button>
        </div>
      </div>
    </div>
  );
}
