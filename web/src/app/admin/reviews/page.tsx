'use client';

import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { StarRating } from '@/components/StarRating';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina, EstadoVazio, Secao, Selo } from '@/components/admin/Pagina';

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
      <CabecalhoPagina
        icone="/admin/reviews"
        titulo="Avaliações"
        descricao={
          <>
            {total} avaliaç{total === 1 ? 'ão' : 'ões'} dos seus produtos. Oculte ou
            remova o que for spam, ofensivo ou fora de contexto; o resto aparece na
            vitrine automaticamente.
          </>
        }
      />

      {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : reviews.length === 0 ? (
        <Secao semRespiro>
          <EstadoVazio
            icone="/admin/reviews"
            titulo="Nenhuma avaliação ainda"
            texto="Depois da entrega, o cliente pode avaliar o produto. As avaliações aparecem aqui e na página do produto."
          />
        </Secao>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {reviews.map((r) => (
            <li key={r.id} className={`px-5 py-4 ${r.hidden ? 'bg-[#fafafa]' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating value={r.rating} size={13} />
                    <span className="text-[15px] font-semibold">{r.customer.name}</span>
                    {r.verifiedPurchase ? <Selo tom="ok">Compra verificada</Selo> : null}
                    {r.hidden ? <Selo>Oculta na vitrine</Selo> : null}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {r.product.name} · {formatDate(r.createdAt)}
                  </p>
                  {r.comment ? (
                    <p className={`mt-2 max-w-[70ch] text-[14px] leading-relaxed ${r.hidden ? 'text-muted' : 'text-[#333]'}`}>{r.comment}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 px-3 text-[13px]"
                    onClick={() => toggleHidden(r)}
                  >
                    {r.hidden ? 'Reexibir' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 px-3 text-[13px] text-[#b42318] hover:!bg-[#fef3f2]"
                    onClick={() => remove(r)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
