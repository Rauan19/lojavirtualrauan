'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useCustomer } from '@/components/CustomerProvider';
import { StarRating, StarRatingInput } from '@/components/StarRating';
import { createReview, fetchReviews, type ReviewsResponse } from '@/lib/reviews';

type Props = {
  storeSlug: string;
  productId: string;
  idOrSlug: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function ProductReviews({ storeSlug, productId, idOrSlug }: Props) {
  const { customer, token } = useCustomer();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  function load() {
    fetchReviews(storeSlug, idOrSlug).then(setData);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug, idOrSlug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (rating < 1) {
      setFormError('Escolha uma nota de 1 a 5');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createReview(storeSlug, token, {
        productId,
        rating,
        comment: comment.trim() || undefined,
      });
      setDone(true);
      setComment('');
      setRating(0);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao enviar avaliação');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 border-t border-line pt-5">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold">Avaliações</h2>
        {data && data.total > 0 ? (
          <div className="flex items-center gap-1.5">
            <StarRating value={data.avgRating} size={14} />
            <span className="text-xs text-muted">
              {data.avgRating.toFixed(1)} · {data.total} avaliaç{data.total === 1 ? 'ão' : 'ões'}
            </span>
          </div>
        ) : null}
      </div>

      {customer ? (
        done ? (
          <p className="mt-3 text-sm text-[var(--ok)]">Obrigado! Sua avaliação foi publicada.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-3 space-y-2 border border-line bg-[#fafafa] p-3">
            <p className="label">Sua nota</p>
            <StarRatingInput value={rating} onChange={setRating} />
            <textarea
              className="field"
              rows={2}
              placeholder="Conte como foi sua experiência (opcional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
            />
            {formError ? <p className="text-xs text-accent">{formError}</p> : null}
            <button type="submit" className="btn btn-accent px-3 py-1.5 text-xs" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Publicar avaliação'}
            </button>
          </form>
        )
      ) : (
        <p className="mt-3 text-xs text-muted">
          <Link href={`/loja/${storeSlug}/conta/entrar`} className="font-semibold underline">
            Entre na sua conta
          </Link>{' '}
          para avaliar este produto.
        </p>
      )}

      {data && data.items.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {data.items.map((r) => (
            <li key={r.id} className="border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <StarRating value={r.rating} size={12} />
                <span className="text-xs font-semibold">{r.customerName}</span>
                {r.verifiedPurchase ? (
                  <span className="border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ok)]">
                    Compra verificada
                  </span>
                ) : null}
                <span className="text-[11px] text-muted">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment ? (
                <p className="mt-1.5 text-sm leading-relaxed text-[#333]">{r.comment}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : data ? (
        <p className="mt-4 text-xs text-muted">Nenhuma avaliação ainda. Seja o primeiro a avaliar.</p>
      ) : null}
    </div>
  );
}
