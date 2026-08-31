'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

type Plan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  periodDays: number;
  highlight?: boolean;
  badge?: string;
  features?: string[];
};

type BillingMe = {
  store: {
    id: string;
    name: string;
    status: string;
    planName: string;
    planDueAt: string | null;
    monthlyFee: number | null;
    daysLeft: number | null;
    planState: 'ok' | 'expiring' | 'expired' | 'none';
    subscriptionStatus?: string | null;
    recurringActive?: boolean;
    accessBlocked?: boolean;
    lastPaidAt?: string | null;
    lastPaidAmount?: number | null;
    lastPaidPlanName?: string | null;
    /** CARD (recorrência do MP) ou PIX (cobrança mensal gerada por nós). */
    billingMethod?: string | null;
  };
  plans: Plan[];
  paymentsEnabled: boolean;
  publicKey?: string | null;
  billingMode?: 'plan_associated' | 'subscription' | string;
  recentInvoices: {
    id: string;
    planId: string;
    planName: string;
    amount: number;
    periodDays: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }[];
};

const FALLBACK_FEATURES = [
  'Loja online completa',
  'Link da loja incluso (slug)',
  'Domínio próprio opcional — o registro do domínio é pago por você',
];

function statusLabel(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'Ativa';
    case 'TRIAL':
      return 'Trial';
    case 'PAST_DUE':
      return 'Em atraso';
    case 'SUSPENDED':
      return 'Suspensa';
    default:
      return status;
  }
}

function invoiceStatusLabel(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'Pago';
    case 'PENDING':
      return 'Pendente';
    case 'REJECTED':
      return 'Recusado';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status;
  }
}

function invoiceStatusClass(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'text-emerald-700';
    case 'PENDING':
      return 'text-amber-700';
    case 'REJECTED':
    case 'CANCELLED':
      return 'text-rose-700';
    default:
      return 'text-muted';
  }
}

/** Acento discreto por plano — só a barra lateral. */
function planAccent(planId: string) {
  const id = planId.toLowerCase();
  if (id === 'essencial' || id.includes('essencial')) return 'bg-[#3d7ea6]';
  if (id === 'pro' || id.includes('pro')) return 'bg-[#2c2c2c]';
  return 'bg-[#1a6b5c]'; // mensal
}

function planDisplayName(planId: string | null | undefined, plans: Plan[]) {
  if (!planId) return 'Sem plano';
  const found = plans.find((p) => p.id === planId);
  if (found) return found.name;
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DetailRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
      </div>
      <div className="max-w-[58%] text-right text-sm font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}

type CobrancaPix = {
  id: string;
  amount: string | number;
  planName: string;
  copiaECola: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  expirada: boolean;
  /** Outra requisição está emitindo agora — o QR chega na próxima consulta. */
  gerando: boolean;
};

export function AdminPlanosInner() {
  const searchParams = useSearchParams();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [data, setData] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkoutLink, setCheckoutLink] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<'CARD' | 'PIX'>('CARD');
  const [pix, setPix] = useState<CobrancaPix | null>(null);
  const [pixBusy, setPixBusy] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [banner, setBanner] = useState<{
    tone: 'ok' | 'warn' | 'err';
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<BillingMe>('/billing/me', {
        token,
        storeSlug: user.store.slug,
      });
      setData(res);
      setSelectedId((prev) => {
        if (prev && res.plans.some((p) => p.id === prev)) return prev;
        const highlighted = res.plans.find((p) => p.highlight);
        return highlighted?.id || res.plans[0]?.id || null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);


  useEffect(() => {
    const status = searchParams.get('status');
    const invoiceId = searchParams.get('invoice');
    if (!status) return;

    if (status === 'success') {
      setBanner({
        tone: 'ok',
        text: 'Pagamento recebido. Estamos confirmando a assinatura com o Mercado Pago…',
      });
    } else if (status === 'pending') {
      setBanner({
        tone: 'warn',
        text: 'Assinatura em análise. Assim que o Mercado Pago autorizar, a recorrência começa.',
      });
    } else if (status === 'failure') {
      setBanner({
        tone: 'err',
        text: 'Assinatura não concluída. Você pode tentar de novo.',
      });
    }

    if (invoiceId && (status === 'success' || status === 'pending')) {
      setPendingInvoiceId(invoiceId);
      const user = getUser();
      const token = getToken();
      if (user?.store?.slug && token) {
        void api(`/billing/invoices/${invoiceId}/sync`, {
          method: 'POST',
          token,
          storeSlug: user.store.slug,
        })
          .then((me) => {
            setData(me as BillingMe);
            const active = (me as BillingMe).store?.recurringActive;
            if (active) {
              setPendingInvoiceId(null);
              setBanner({
                tone: 'ok',
                text: 'Plano ativo! Assinatura confirmada e próxima cobrança atualizada.',
              });
            }
          })
          .catch(() => load());
      }
    }
  }, [searchParams, load]);

  // Polling enquanto aguarda autorização no MP (webhook em teste quase não chega)
  useEffect(() => {
    if (!pendingInvoiceId) return;
    if (data?.store?.recurringActive) {
      setPendingInvoiceId(null);
      return;
    }

    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 40) {
        window.clearInterval(timer);
        setBanner({
          tone: 'warn',
          text: 'Ainda aguardando o Mercado Pago. Clique em “Atualizar status” se já pagou.',
        });
        return;
      }
      void api<BillingMe>(`/billing/invoices/${pendingInvoiceId}/sync`, {
        method: 'POST',
        token,
        storeSlug: user.store!.slug,
      })
        .then((me) => {
          setData(me);
            if (me.store?.recurringActive) {
              window.clearInterval(timer);
              setPendingInvoiceId(null);
              setCheckoutLink(null);
              setBanner({
                tone: 'ok',
                text: 'Plano ativo! Assinatura confirmada e próxima cobrança atualizada.',
              });
            }
        })
        .catch(() => undefined);
    }, 3000);

    const onFocus = () => {
      void api<BillingMe>(`/billing/invoices/${pendingInvoiceId}/sync`, {
        method: 'POST',
        token,
        storeSlug: user.store!.slug,
      })
        .then((me) => {
          setData(me);
          if (me.store?.recurringActive) {
            setPendingInvoiceId(null);
            setBanner({
              tone: 'ok',
              text: 'Plano ativo! Assinatura confirmada e próxima cobrança atualizada.',
            });
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [pendingInvoiceId, data?.store?.recurringActive]);

  /**
   * Checkout de Assinaturas do MP (preapproval pending → init_point).
   * Card Brick + authorized falha em TEST com "Card token service not found".
   */
  async function startSubscriptionCheckout() {
    if (!selected) return;
    if (store?.recurringActive && store.planName === selected.id) return;

    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;

    setPayingId(selected.id);
    setError('');
    setBanner(null);
    setCheckoutLink(null);

    // Abrir a aba NO CLIQUE (antes do await). Depois do await o browser bloqueia pop-up
    // e o fallback location.href fechava o admin.
    const popup = window.open('about:blank', '_blank');

    try {
      const payRes = await api<{
        initPoint: string;
        sandboxInitPoint?: string;
        liveMode: boolean;
        invoiceId?: string;
      }>('/billing/checkout', {
        method: 'POST',
        token,
        storeSlug: user.store.slug,
        body: { planId: selected.id },
      });
      const url = !payRes.liveMode
        ? payRes.sandboxInitPoint || payRes.initPoint
        : payRes.initPoint || payRes.sandboxInitPoint;
      if (!url) throw new Error('Link de assinatura não retornado');

      if (payRes.invoiceId) {
        setPendingInvoiceId(payRes.invoiceId);
      }

      if (popup && !popup.closed) {
        popup.location.href = url;
        setBanner({
          tone: 'ok',
          text: 'Checkout aberto em nova aba. Ao pagar, esta página atualiza o plano sozinha.',
        });
      } else {
        // Pop-up bloqueado: não navega nesta aba — mostra link
        setBanner({
          tone: 'warn',
          text: 'Permita pop-ups e clique em “Abrir Mercado Pago” abaixo.',
        });
        setCheckoutLink(url);
      }
      setPayingId(null);
      void load();
    } catch (e) {
      if (popup && !popup.closed) popup.close();
      setError(
        e instanceof Error
          ? e.message
          : 'Erro ao abrir checkout de assinatura',
      );
      setPayingId(null);
    }
  }

  async function carregarPix() {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;
    try {
      const atual = await api<CobrancaPix | Record<string, never>>(
        '/billing/pix/atual',
        { token, storeSlug: user.store.slug },
      );
      setPix(atual && 'id' in atual ? (atual as CobrancaPix) : null);
    } catch {
      setPix(null);
    }
  }

  /** Assina por Pix (ou gera a cobrança do ciclo, se já for assinante). */
  async function gerarPix(assinando: boolean) {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;
    if (assinando && !selected) return;

    setPixBusy(true);
    setError('');
    setBanner(null);
    try {
      const cobranca = await api<CobrancaPix>(
        assinando ? '/billing/subscribe/pix' : '/billing/pix/gerar',
        {
          method: 'POST',
          token,
          storeSlug: user.store.slug,
          ...(assinando ? { body: { planId: selected!.id } } : {}),
        },
      );
      setPix(cobranca);
      setBanner({
        tone: 'ok',
        text: 'Cobrança Pix gerada. Pague pelo QR ou copia e cola.',
      });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar cobrança Pix');
    } finally {
      setPixBusy(false);
    }
  }

  async function copiarPix() {
    if (!pix?.copiaECola) return;
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione o código e copie na mão.');
    }
  }

  async function cancelSubscription() {
    if (!store?.recurringActive) return;
    const due = store.planDueAt
      ? new Date(store.planDueAt).toLocaleDateString('pt-BR')
      : null;
    const ok = await confirm({
      title: 'Cancelar assinatura?',
      message:
        'A renovação automática no Mercado Pago será encerrada. Você continua com acesso até o fim do período já pago' +
        (due ? ` (${due})` : '') +
        '. Depois disso a loja fica bloqueada até assinar de novo.',
      confirmLabel: 'Sim, cancelar',
      cancelLabel: 'Manter assinatura',
      danger: true,
    });
    if (!ok) return;

    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;

    setCancelling(true);
    setError('');
    try {
      const me = await api<BillingMe>('/billing/cancel', {
        method: 'POST',
        token,
        storeSlug: user.store.slug,
      });
      setData(me);
      setBanner({
        tone: 'ok',
        text:
          'Assinatura cancelada no Mercado Pago. Sem novas cobranças.' +
          (me.store.planDueAt
            ? ` Acesso até ${new Date(me.store.planDueAt).toLocaleDateString('pt-BR')}.`
            : ''),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Erro ao cancelar assinatura',
      );
    } finally {
      setCancelling(false);
    }
  }

  const store = data?.store;

  /*
   * Se a loja já paga por Pix, o QR em aberto aparece assim que a tela abre —
   * o lojista não precisa clicar em nada para reencontrar a cobrança do mês.
   */
  useEffect(() => {
    if (store?.billingMethod === 'PIX') {
      setMetodo('PIX');
      void carregarPix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.billingMethod]);
  const plans = data?.plans || [];
  const selected = plans.find((p) => p.id === selectedId) || null;
  const currentPlanId = store?.planName || null;
  const currentPlanLabel = planDisplayName(currentPlanId, plans);

  const recurrenceLabel = useMemo(() => {
    if (!store) return '—';
    if (store.recurringActive) return 'Ativa';
    if (store.subscriptionStatus === 'pending') return 'Aguardando cartão';
    if (store.subscriptionStatus === 'paused') return 'Pausada';
    if (store.subscriptionStatus === 'cancelled') return 'Cancelada';
    return 'Não iniciada';
  }, [store]);

  const dueLabel = useMemo(() => {
    if (!store?.planDueAt) return '—';
    const date = new Date(store.planDueAt).toLocaleDateString('pt-BR');
    if (store.daysLeft == null) return date;
    if (store.daysLeft < 0) return `${date} · vencido`;
    if (store.daysLeft === 0) return `${date} · vence hoje`;
    return `${date} · ${store.daysLeft} dia${store.daysLeft === 1 ? '' : 's'}`;
  }, [store]);

  const lastPaidLabel = useMemo(() => {
    if (!store?.lastPaidAt) return '—';
    const date = new Date(store.lastPaidAt).toLocaleString('pt-BR');
    if (store.lastPaidAmount != null) {
      return `${date} · ${money(store.lastPaidAmount)}`;
    }
    return date;
  }, [store]);

  async function refreshSubscriptionStatus() {
    const user = getUser();
    const token = getToken();
    if (!user?.store?.slug || !token) return;

    const invoiceId =
      pendingInvoiceId ||
      data?.recentInvoices?.find((i) => i.status === 'APPROVED')?.id ||
      data?.recentInvoices?.find((i) => i.status === 'PENDING')?.id ||
      data?.recentInvoices?.[0]?.id;

    setError('');
    try {
      if (invoiceId) {
        const me = await api<BillingMe>(`/billing/invoices/${invoiceId}/sync`, {
          method: 'POST',
          token,
          storeSlug: user.store.slug,
        });
        setData(me);
        if (me.store?.recurringActive) {
          setPendingInvoiceId(null);
          setBanner({
            tone: 'ok',
            text: 'Plano ativo! Assinatura confirmada e próxima cobrança atualizada.',
          });
        } else {
          setBanner({
            tone: 'warn',
            text: 'Ainda não autorizado no Mercado Pago. Se já pagou, aguarde alguns segundos e tente de novo.',
          });
        }
      } else {
        await load();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Erro ao atualizar status da assinatura',
      );
    }
  }

  return (
    <div className="admin-page max-w-5xl space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {BRAND.name}
        </p>
        <h1 className="mt-1">Assinatura</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Mensalidade da sua loja na plataforma. Cobrança recorrente no Mercado
          Pago — separado do pagamento dos seus clientes.
        </p>
      </div>

      {store?.accessBlocked ||
      store?.status === 'PAST_DUE' ||
      store?.status === 'SUSPENDED' ||
      store?.planState === 'expired' ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-900">
          <p className="font-bold">Painel bloqueado — mensalidade em atraso</p>
          <p className="mt-1 text-rose-800/90">
            Escolha um plano abaixo e renove para voltar a usar a loja.
          </p>
        </div>
      ) : null}

      {banner ? (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-sm ${
            banner.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : banner.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {banner.text}
          {checkoutLink ? (
            <p className="mt-2">
              <a
                href={checkoutLink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline"
                onClick={() => setCheckoutLink(null)}
              >
                Abrir Mercado Pago
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.06] bg-[#fafafa] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Sua assinatura
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight">
              {loading && !store ? 'Carregando…' : currentPlanLabel}
            </p>
            {store?.name ? (
              <p className="mt-0.5 text-sm text-muted">Loja {store.name}</p>
            ) : null}
          </div>
          {store ? (
            <div className="flex flex-wrap gap-2">
              <span
                className={[
                  'rounded-full px-2.5 py-1 text-[11px] font-bold',
                  store.recurringActive
                    ? 'bg-emerald-100 text-emerald-800'
                    : store.subscriptionStatus === 'pending'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-zinc-100 text-zinc-700',
                ].join(' ')}
              >
                Recorrência: {recurrenceLabel}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700">
                Loja: {statusLabel(store.status)}
              </span>
            </div>
          ) : null}
        </div>

        {store ? (
          <div className="grid gap-0 px-5 md:grid-cols-2 md:gap-x-10">
            <div>
              <DetailRow
                label="Valor mensal"
                value={
                  store.monthlyFee != null
                    ? money(store.monthlyFee)
                    : 'A definir'
                }
              />
              <DetailRow label="Próxima cobrança" value={dueLabel} />
              <DetailRow
                label="Última cobrança"
                value={lastPaidLabel}
                hint={
                  store.lastPaidPlanName
                    ? `Plano ${store.lastPaidPlanName}`
                    : undefined
                }
              />
            </div>
            <div>
              <DetailRow
                label="Forma de pagamento"
                value="Cartão · Mercado Pago"
                hint="Renovação automática todo mês"
              />
              <DetailRow
                label="O que aparece no MP"
                value={`Mensalidade ${BRAND.name} · Plano ${currentPlanLabel}`}
                hint="Título da assinatura no checkout"
              />
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] py-3 last:border-b-0">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                    Status
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {store.recurringActive
                      ? 'Ativo'
                      : store.subscriptionStatus === 'cancelled'
                        ? 'Cancelada (sem renovação)'
                        : store.subscriptionStatus === 'pending'
                          ? 'Aguardando pagamento'
                          : statusLabel(store.status)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => void refreshSubscriptionStatus()}
                  >
                    Atualizar status
                  </button>
                  {store.recurringActive ? (
                    <button
                      type="button"
                      className="btn btn-danger text-xs"
                      disabled={cancelling}
                      onClick={() => void cancelSubscription()}
                    >
                      {cancelling ? 'Cancelando…' : 'Cancelar assinatura'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {store?.recurringActive ? (
          <p className="border-t border-black/[0.06] px-5 py-3 text-xs text-muted">
            Plano ativo com cobrança automática. Para mudar de plano, cancele a
            assinatura atual e assine o novo depois.
          </p>
        ) : null}

        {!data?.paymentsEnabled ? (
          <p className="border-t border-black/[0.06] px-5 py-3 text-xs text-amber-800">
            Pagamento ainda não configurado na plataforma. Peça ao suporte /
            Super Admin para salvar o Mercado Pago.
          </p>
        ) : null}
      </section>

      {!store?.recurringActive ? (
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold">
            {store?.subscriptionStatus === 'cancelled'
              ? 'Assinar novamente'
              : 'Escolher plano'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Escolha um plano. No Mercado Pago você autoriza o cartão — a
            cobrança segue todo mês.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const active = selectedId === plan.id;
            const isCurrent = currentPlanId === plan.id;
            const features =
              plan.features && plan.features.length > 0
                ? plan.features
                : FALLBACK_FEATURES;

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className={[
                  'group relative flex h-full flex-col rounded-2xl border p-5 text-left transition',
                  'bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md',
                  active
                    ? 'border-ink ring-2 ring-ink/20'
                    : 'border-black/10 hover:border-black/20',
                  plan.highlight && !active ? 'border-ink/25' : '',
                ].join(' ')}
              >
                {plan.badge ? (
                  <span
                    className={[
                      'absolute -top-2.5 left-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      plan.highlight
                        ? 'bg-ink text-white'
                        : 'bg-zinc-100 text-zinc-700',
                    ].join(' ')}
                  >
                    {plan.badge}
                  </span>
                ) : null}

                <div className="mt-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold tracking-tight">
                      {plan.name}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {plan.description}
                    </p>
                  </div>
                  <span
                    className={[
                      'mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-black/20 bg-white text-transparent',
                    ].join(' ')}
                    aria-hidden
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                </div>

                <div className="mt-5">
                  <p className="text-3xl font-bold tracking-tight">
                    {money(plan.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">por mês</p>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2 text-[13px] leading-snug text-zinc-700"
                    >
                      <CheckIcon className="mt-0.5 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Plano atual
                  </p>
                ) : (
                  <span className="mt-4 text-[11px] font-medium text-muted">
                    Selecionar
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/[0.06] bg-[#fafafa] px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Checkout de assinatura
            </p>
            <p className="mt-0.5 text-sm font-bold">
              {selected
                ? `Plano ${selected.name} · ${money(selected.amount)}/mês`
                : 'Selecione um plano'}
            </p>
          </div>

          <div className="px-5 py-4">
            {selected ? (
              <div className="mb-4 grid gap-0 sm:grid-cols-2 sm:gap-x-8">
                <DetailRow
                  label="Produto"
                  value={`Mensalidade ${BRAND.name}`}
                />
                <DetailRow
                  label="Cobrança"
                  value={`${money(selected.amount)} / mês`}
                  hint="Recorrente · checkout de Assinaturas do MP"
                />
              </div>
            ) : null}

            {/*
              Cartão e Pix são mecanismos diferentes, não só um botão a mais:
              no cartão o Mercado Pago cobra sozinho todo mês; em Pix a
              recorrência não existe na API deles, então geramos uma cobrança
              nova a cada ciclo e o lojista precisa pagar. A escolha diz isso
              com todas as letras — descobrir depois seria péssimo.
            */}
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: 'CARD' as const,
                    titulo: 'Cartão de crédito',
                    desc: 'Renova sozinho todo mês. Você não precisa fazer nada.',
                  },
                  {
                    id: 'PIX' as const,
                    titulo: 'Pix',
                    desc: 'Geramos a cobrança todo mês e avisamos. Você paga o QR a cada ciclo.',
                  },
                ]
              ).map((op) => (
                <label
                  key={op.id}
                  className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                    metodo === op.id
                      ? 'border-accent bg-accent/[0.04]'
                      : 'border-black/10 hover:border-black/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="metodo-pagamento"
                    className="mt-1 shrink-0"
                    checked={metodo === op.id}
                    onChange={() => setMetodo(op.id)}
                  />
                  <span>
                    <span className="font-bold">{op.titulo}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                      {op.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {metodo === 'CARD' ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn"
                  disabled={
                    !selected ||
                    !data?.paymentsEnabled ||
                    payingId !== null ||
                    Boolean(
                      store?.recurringActive && store.planName === selected?.id,
                    )
                  }
                  onClick={() => void startSubscriptionCheckout()}
                >
                  {payingId
                    ? 'Abrindo assinatura…'
                    : store?.recurringActive && store.planName === selected?.id
                      ? 'Já assinado'
                      : selected
                        ? 'Assinar no Mercado Pago'
                        : 'Selecione um plano'}
                </button>
                <p className="max-w-md text-[11px] leading-snug text-muted">
                  Abre o checkout do Mercado Pago em nova aba para autorizar o
                  cartão. A cobrança renova todo mês automaticamente.
                </p>
              </div>
            ) : (
              <PixBox
                pix={pix}
                busy={pixBusy}
                copiado={pixCopiado}
                podeGerar={Boolean(selected) && Boolean(data?.paymentsEnabled)}
                jaAssinante={store?.billingMethod === 'PIX'}
                onGerar={() => void gerarPix(store?.billingMethod !== 'PIX')}
                onCopiar={() => void copiarPix()}
                onAtualizar={() => void carregarPix()}
              />
            )}
          </div>
        </div>
      </section>
      ) : null}

      {data?.recentInvoices && data.recentInvoices.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/[0.06] bg-[#fafafa] px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Histórico
            </p>
            <p className="mt-0.5 text-sm font-bold">Últimas cobranças</p>
          </div>
          <div className="overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  <th className="px-5 py-2.5 font-bold">Plano</th>
                  <th className="px-3 py-2.5 font-bold">Data</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-5 py-2.5 text-right font-bold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map((inv) => {
                  const label =
                    planDisplayName(inv.planId, plans) || inv.planName;
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-black/[0.06] last:border-b-0"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-8 w-1 shrink-0 rounded-full ${planAccent(inv.planId || inv.planName)}`}
                            aria-hidden
                          />
                          <span className="font-semibold text-ink">
                            {label}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        {new Date(
                          inv.paidAt || inv.createdAt,
                        ).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-semibold ${invoiceStatusClass(inv.status)}`}
                        >
                          {invoiceStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                        {money(inv.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {confirmDialog}
    </div>
  );
}

/**
 * Bloco do Pix: QR, copia e cola e validade.
 *
 * A validade fica visível porque a cobrança expira — QR vencido no painel,
 * sem aviso, é o lojista tentando pagar e o app do banco recusando sem
 * explicar por quê.
 */
function PixBox({
  pix,
  busy,
  copiado,
  podeGerar,
  jaAssinante,
  onGerar,
  onCopiar,
  onAtualizar,
}: {
  pix: CobrancaPix | null;
  busy: boolean;
  copiado: boolean;
  podeGerar: boolean;
  jaAssinante: boolean;
  onGerar: () => void;
  onCopiar: () => void;
  onAtualizar: () => void;
}) {
  const util = pix && !pix.expirada && pix.copiaECola;

  if (!util) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn"
          disabled={busy || (!jaAssinante && !podeGerar)}
          onClick={onGerar}
        >
          {busy
            ? 'Gerando cobrança…'
            : pix?.expirada
              ? 'Gerar nova cobrança'
              : jaAssinante
                ? 'Gerar cobrança do mês'
                : 'Assinar pagando com Pix'}
        </button>
        <p className="max-w-md text-[11px] leading-snug text-muted">
          {pix?.expirada
            ? 'A cobrança anterior expirou. Gere uma nova para pagar.'
            : pix?.gerando
              ? 'A cobrança está sendo emitida. Atualize em instantes.'
              : 'Pix não tem débito automático: a cada mês geramos a cobrança e avisamos por e-mail.'}
        </p>
        {pix?.gerando ? (
          <button type="button" className="btn btn-ghost" onClick={onAtualizar}>
            Atualizar
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/10 bg-[#fafafa] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {pix.qrCodeBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="QR Code do Pix da mensalidade"
            className="h-40 w-40 shrink-0 rounded-lg border border-black/10 bg-white p-1"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {money(Number(pix.amount))} · {pix.planName}
          </p>
          {pix.expiresAt ? (
            <p className="mt-0.5 text-[12px] text-muted">
              Pague até{' '}
              {new Date(pix.expiresAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
              })}
            </p>
          ) : null}

          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">
            Copia e cola
          </p>
          <p className="mt-1 max-h-16 overflow-y-auto break-all rounded-lg border border-black/10 bg-white p-2 font-mono text-[11px] leading-snug">
            {pix.copiaECola}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={onCopiar}>
              {copiado ? 'Copiado!' : 'Copiar código'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onAtualizar}
            >
              Já paguei — atualizar
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            O pagamento é confirmado sozinho em alguns segundos. Se demorar,
            use o botão acima.
          </p>
        </div>
      </div>
    </div>
  );
}
