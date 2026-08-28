'use client';

import { useEffect, useState } from 'react';
import {
  buildFreeOnlyPlan,
  fetchInstallments,
  installmentHeadlineFromPlan,
  mapApiOptionsToPlan,
  normalizeInterestFreeMax,
  type InstallmentsResponse,
} from '@/lib/installments';

type Props = {
  amount: number;
  storeSlug: string;
  interestFreeMax?: number | null;
  /** compact = cards da loja; full = página do produto */
  variant?: 'compact' | 'full';
  className?: string;
  /**
   * Resultado já buscado (ex.: vitrine, que busca parcelas de todos os
   * produtos em lote). Quando definido, o componente não faz fetch próprio.
   */
  preset?: InstallmentsResponse | null;
  presetLoading?: boolean;
};

/**
 * Só preview informativo na vitrine/produto.
 * A escolha real da parcela é no Payment Brick do Mercado Pago no checkout.
 */
export function InstallmentsBlock({
  amount,
  storeSlug,
  interestFreeMax,
  variant = 'full',
  className = '',
  preset,
  presetLoading = false,
}: Props) {
  const usesPreset = preset !== undefined;
  const freeMax = normalizeInterestFreeMax(interestFreeMax);

  const [loading, setLoading] = useState(!usesPreset);
  const [headline, setHeadline] = useState(() =>
    installmentHeadlineFromPlan(
      amount,
      buildFreeOnlyPlan(amount, freeMax),
      freeMax,
    ),
  );

  // Busca própria só quando ninguém forneceu um resultado pronto (preset).
  useEffect(() => {
    if (usesPreset) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const data = await fetchInstallments({
        amount,
        storeSlug,
        freeUntil: freeMax,
      });
      if (cancelled) return;
      const plan = data?.options?.length
        ? mapApiOptionsToPlan(data.options)
        : buildFreeOnlyPlan(amount, freeMax);
      setHeadline(installmentHeadlineFromPlan(amount, plan, freeMax));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [usesPreset, amount, storeSlug, freeMax]);

  useEffect(() => {
    if (!usesPreset) return;
    const plan = preset?.options?.length
      ? mapApiOptionsToPlan(preset.options)
      : buildFreeOnlyPlan(amount, freeMax);
    setHeadline(installmentHeadlineFromPlan(amount, plan, freeMax));
  }, [usesPreset, preset, amount, freeMax]);

  const effectiveLoading = usesPreset ? presetLoading : loading;

  if (effectiveLoading && variant === 'compact') return null;

  if (variant === 'compact') {
    return (
      <div className={className}>
        {freeMax >= 2 ? (
          <p className="text-[10px] font-semibold text-[var(--ok)]">
            à vista ou {freeMax}x sem juros
          </p>
        ) : headline.cardLine ? (
          <p className="text-[10px] text-muted">à vista ou cartão c/ juros</p>
        ) : (
          <p className="text-[10px] text-muted">à vista</p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {effectiveLoading ? (
        <p className="text-xs text-muted">Consultando parcelas…</p>
      ) : (
        <>
          {headline.cashLine ? (
            <p className="text-sm font-semibold text-ink">{headline.cashLine}</p>
          ) : null}
          {headline.cardLine ? (
            <p
              className={`mt-0.5 text-sm font-semibold ${
                freeMax >= 2 ? 'text-[var(--ok)]' : 'text-orange-700'
              }`}
            >
              {headline.cardLine}
            </p>
          ) : null}
          {headline.cardExtraLine ? (
            <p className="mt-0.5 text-sm text-muted">{headline.cardExtraLine}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            No pagamento, escolha o cartão e as parcelas no checkout do Mercado
            Pago.
          </p>
        </>
      )}
    </div>
  );
}
