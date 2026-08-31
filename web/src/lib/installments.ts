import { api, money } from '@/lib/api';

export type InstallmentOption = {
  count: number;
  installmentAmount: number;
  totalAmount: number;
  interestFree: boolean;
  label: string;
  installmentRate?: number;
  source?: 'store_offer' | 'mercadopago';
};

export type InstallmentsResponse = {
  amount: number;
  freeUntil: number;
  paymentMethodId: string;
  source: 'mercadopago' | 'unavailable';
  gatewayMessage?: string;
  options: Array<{
    count: number;
    installmentAmount: number;
    totalAmount: number;
    interestFree: boolean;
    installmentRate: number;
    recommendedMessage?: string;
    source: 'store_offer' | 'mercadopago';
  }>;
};

export function normalizeInterestFreeMax(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(12, Math.max(0, Math.floor(value)));
}

/** Só as parcelas sem juros da oferta (fallback se MP falhar). */
export function buildFreeOnlyPlan(
  amount: number,
  interestFreeMax?: number | null,
): InstallmentOption[] {
  const principal = Number(amount);
  if (!Number.isFinite(principal) || principal <= 0) return [];
  const freeMax = normalizeInterestFreeMax(interestFreeMax);
  const rows: InstallmentOption[] = [
    {
      count: 1,
      installmentAmount: principal,
      totalAmount: principal,
      interestFree: true,
      label: `${money(principal)} à vista`,
      source: 'store_offer',
    },
  ];
  for (let n = 2; n <= freeMax; n++) {
    const installmentAmount = principal / n;
    rows.push({
      count: n,
      installmentAmount,
      totalAmount: principal,
      interestFree: true,
      label: `${n}x de ${money(installmentAmount)} sem juros`,
      source: 'store_offer',
    });
  }
  return rows;
}

export function mapApiOptionsToPlan(
  options: InstallmentsResponse['options'],
): InstallmentOption[] {
  return options.map((o) => ({
    count: o.count,
    installmentAmount: o.installmentAmount,
    totalAmount: o.totalAmount,
    interestFree: o.interestFree,
    installmentRate: o.installmentRate,
    source: o.source,
    label: o.interestFree
      ? o.count === 1
        ? `${money(o.installmentAmount)} à vista`
        : `${o.count}x de ${money(o.installmentAmount)} sem juros`
      : `${o.count}x de ${money(o.installmentAmount)} · total ${money(o.totalAmount)}`,
  }));
}

export function installmentHeadlineFromPlan(
  amount: number,
  plan: InstallmentOption[],
  freeMax = 0,
) {
  const cash = Number(amount);
  const free = [...plan]
    .filter((p) => p.interestFree && p.count >= 2)
    .sort((a, b) => b.count - a.count)[0];
  const withInterest = [...plan]
    .filter((p) => !p.interestFree)
    .sort((a, b) => b.count - a.count)[0];

  const cashLine =
    Number.isFinite(cash) && cash > 0
      ? `À vista ${money(cash)}`
      : null;

  let cardLine: string | null = null;
  if (freeMax >= 2 && free) {
    cardLine = `ou no cartão em até ${free.count}x de ${money(free.installmentAmount)} sem juros`;
  } else if (withInterest) {
    cardLine = `ou no cartão em até ${withInterest.count}x de ${money(withInterest.installmentAmount)} com juros · total ${money(withInterest.totalAmount)}`;
  } else if (freeMax >= 2) {
    cardLine = `ou no cartão em até ${freeMax}x sem juros`;
  }

  /*
   * CDC art. 52, II e III: parcelamento com juros tem que informar o montante
   * dos acréscimos e a soma total a pagar. Mostrar só o valor da parcela é
   * infração — e o total já vem calculado na cotação.
   */
  const cardExtraLine =
    freeMax >= 2 && free && withInterest
      ? `ou em até ${withInterest.count}x de ${money(withInterest.installmentAmount)} com juros · total ${money(withInterest.totalAmount)}`
      : null;

  return {
    cashLine,
    cardLine,
    cardExtraLine,
    /** @deprecated use cardLine */
    freeLine: free
      ? `em até ${free.count}x de ${money(free.installmentAmount)} sem juros`
      : null,
    withInterestLine: withInterest
      ? `ou até ${withInterest.count}x de ${money(withInterest.installmentAmount)} com juros`
      : null,
  };
}

/** Busca parcelas reais no backend (Mercado Pago). */
export async function fetchInstallments(opts: {
  amount: number;
  storeSlug: string;
  freeUntil?: number | null;
  paymentMethodId?: string;
}): Promise<InstallmentsResponse | null> {
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount < 1 || !opts.storeSlug) return null;
  const freeUntil = normalizeInterestFreeMax(opts.freeUntil);
  const params = new URLSearchParams({
    amount: amount.toFixed(2),
    freeUntil: String(freeUntil),
    payment_method_id: opts.paymentMethodId || 'visa',
  });
  try {
    return await api<InstallmentsResponse>(
      `/storefront/installments?${params}`,
      { storeSlug: opts.storeSlug },
    );
  } catch {
    return null;
  }
}

/**
 * Busca parcelas de vários produtos numa chamada só — usado na vitrine pra
 * não disparar 1 request por card.
 */
export async function fetchInstallmentsBatch(opts: {
  items: { id: string; amount: number; freeUntil?: number | null }[];
  storeSlug: string;
  paymentMethodId?: string;
}): Promise<Record<string, InstallmentsResponse>> {
  const items = opts.items
    .map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      freeUntil: normalizeInterestFreeMax(i.freeUntil),
    }))
    .filter((i) => Number.isFinite(i.amount) && i.amount >= 1);
  if (!items.length || !opts.storeSlug) return {};
  try {
    return await api<Record<string, InstallmentsResponse>>(
      '/storefront/installments/batch',
      {
        method: 'POST',
        storeSlug: opts.storeSlug,
        body: {
          items,
          paymentMethodId: opts.paymentMethodId || 'visa',
        },
      },
    );
  } catch {
    return {};
  }
}

/** No carrinho: usa o maior "sem juros" entre os itens. */
export function cartInterestFreeMax(
  items: { installmentsFree?: number | null }[],
) {
  let max = 0;
  for (const item of items) {
    max = Math.max(max, normalizeInterestFreeMax(item.installmentsFree));
  }
  return max;
}
