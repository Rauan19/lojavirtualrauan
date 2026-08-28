'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { api, mediaUrl, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Product = {
  id: string;
  name: string;
  price: string;
  compareAt?: string | null;
  images: { url: string }[];
};

type Promotion = {
  id: string;
  title?: string | null;
  active: boolean;
  endsAt?: string | null;
  product: Product;
};

export default function AdminPromotionsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [title, setTitle] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  async function load() {
    const { token, storeSlug } = auth();
    if (!token) return;
    const [promos, productList] = await Promise.all([
      api<Promotion[]>('/admin/promotions', { token, storeSlug }),
      api<{ items: Product[] }>('/admin/products?limit=100', { token, storeSlug }),
    ]);
    setPromotions(promos);
    setProducts(productList.items);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, []);

  useEffect(() => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setCompareAt(p.compareAt || p.price);
    if (!promoPrice) setPromoPrice('');
  }, [productId, products]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      await api('/admin/promotions', {
        method: 'POST',
        token,
        storeSlug,
        body: {
          productId,
          title: title || undefined,
          promoPrice: Number(promoPrice),
          compareAt: compareAt ? Number(compareAt) : undefined,
          endsAt: endsAt || undefined,
        },
      });
      setTitle('');
      setPromoPrice('');
      setCompareAt('');
      setEndsAt('');
      setProductId('');
      setMessage('Promoção criada — o preço do produto foi atualizado na vitrine');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: 'Encerrar promoção?',
      message: 'O preço do produto volta ao valor “de” (sem promoção).',
      confirmLabel: 'Encerrar',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    await api(`/admin/promotions/${id}`, { method: 'DELETE', token, storeSlug });
    await load();
  }

  const promoProductIds = new Set(promotions.map((p) => p.product.id));
  const available = products.filter((p) => !promoProductIds.has(p.id));

  return (
    <div className="admin-page">
      <div>
        <h1>Promoções</h1>
        <p className="text-sm text-muted">
          Oferta com preço “de” / “por” na vitrine.
        </p>
      </div>

      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}

      <form onSubmit={onCreate} className="card form-grid md:grid-cols-2">
        <h2 className="text-sm font-bold md:col-span-2">Nova promoção</h2>
        <div className="md:col-span-2">
          <label className="label">Produto</label>
          <select
            className="field"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            <option value="">Selecione...</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {money(p.price)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Preço de (riscado)</label>
          <input
            className="field"
            type="number"
            step="0.01"
            min="0"
            value={compareAt}
            onChange={(e) => setCompareAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Preço por (promo)</label>
          <input
            className="field"
            type="number"
            step="0.01"
            min="0"
            value={promoPrice}
            onChange={(e) => setPromoPrice(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Título (opcional)</label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Liquidação verão"
          />
        </div>
        <div>
          <label className="label">Válida até (opcional)</label>
          <input
            className="field"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <button className="btn btn-accent md:col-span-2" disabled={busy || !productId}>
          {busy ? 'Salvando...' : 'Criar promoção'}
        </button>
      </form>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {promotions.length === 0 ? (
          <p className="text-sm text-muted sm:col-span-2 xl:col-span-3">
            Nenhuma promoção ativa.
          </p>
        ) : (
          promotions.map((promo) => {
            const img = mediaUrl(promo.product.images[0]?.url);
            const price = Number(promo.product.price);
            const de = Number(promo.product.compareAt || 0);
            const pct =
              de > price ? Math.round(((de - price) / de) * 100) : 0;
            return (
              <article key={promo.id} className="card overflow-hidden !p-0">
                <div className="relative aspect-[4/5] bg-[#eee]">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={promo.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  {pct > 0 ? (
                    <span className="absolute left-2 top-2 bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">
                      -{pct}%
                    </span>
                  ) : null}
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-accent">
                    {promo.title || 'Promoção'}
                  </p>
                  <h2 className="text-sm font-medium">{promo.product.name}</h2>
                  <p className="text-xs text-muted line-through">{money(de)}</p>
                  <p className="text-sm font-semibold">{money(price)}</p>
                  <button
                    type="button"
                    className="btn btn-ghost mt-1 w-full py-1.5"
                    onClick={() =>
                      remove(promo.id).catch((err) =>
                        setError(err instanceof Error ? err.message : 'Erro'),
                      )
                    }
                  >
                    Encerrar promoção
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
