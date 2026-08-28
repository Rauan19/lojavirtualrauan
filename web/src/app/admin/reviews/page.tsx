'use client';

import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { StarRating } from '@/components/StarRating';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Review = {
  id: string;
  rating: number;
  comment?: string | null;
  hidden: boolean;
  verifiedPurchase: boolean;
  createdAt: string;
  customer: { name: string; email: string };
  product: { name: string; slug: string };
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminReviewsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  async function load() {
    const { token, storeSlug } = auth();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<{ items: Review[]; total: number }>(
        '/admin/reviews?limit=50',
        { token, storeSlug },
      );
      setReviews(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleHidden(review: Review) {
    const { token, storeSlug } = auth();
    await api(`/admin/reviews/${review.id}/hidden`, {
      method: 'PATCH',
      token,
      storeSlug,
      body: { hidden: !review.hidden },
    });
    await load();
  }

  async function remove(review: Review) {
    const ok = await confirm({
      title: 'Excluir avaliação?',
      message: `A avaliação de ${review.customer.name} sobre "${review.product.name}" será removida definitivamente.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    await api(`/admin/reviews/${review.id}`, { method: 'DELETE', token, storeSlug });
    await load();
  }

  return (
    <div className="admin-page">
      <div>
        <h1>Avaliações</h1>
        <p className="text-sm text-muted">
          {total} avaliaç{total === 1 ? 'ão' : 'ões'} dos seus produtos. Oculte ou
          remova o que for spam, ofensivo ou fora de contexto — o resto fica
          visível na vitrine automaticamente.
        </p>
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : reviews.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">
          Nenhuma avaliação ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.id} className={`card !p-3.5 ${r.hidden ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating value={r.rating} size={13} />
                    <span className="text-sm font-semibold">{r.customer.name}</span>
                    {r.verifiedPurchase ? (
                      <span className="border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ok)]">
                        Compra verificada
                      </span>
                    ) : null}
                    {r.hidden ? (
                      <span className="border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        Oculta
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.product.name} · {formatDate(r.createdAt)}
                  </p>
                  {r.comment ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-[#333]">{r.comment}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={() => toggleHidden(r)}
                  >
                    {r.hidden ? 'Reexibir' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger px-2.5 py-1.5 text-xs"
                    onClick={() => remove(r)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
