'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { useCustomer } from '@/components/CustomerProvider';
import { MpPaymentBrick, type BrickPayerAddress } from '@/components/MpPaymentBrick';
import {
  OfflinePaymentPanel,
  type OfflinePaymentInfo,
} from '@/components/OfflinePaymentPanel';
import { PaymentStatusScreen } from '@/components/PaymentStatusScreen';
import { api, money } from '@/lib/api';

type OrderLite = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  paidAt?: string | null;
  mpPaymentId?: string | null;
  shippingAddress?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string | null;
    neighborhood?: string;
    city?: string;
    state?: string;
  } | null;
};

type PaySession = {
  mode: 'personalized' | 'pro';
  publicKey?: string | null;
  amount: number;
  payerEmail?: string;
  payerName?: string;
  payerAddress?: BrickPayerAddress;
  initPoint?: string;
  sandboxInitPoint?: string;
};

export function OrderDoneInner({
  slug,
  orderId,
}: {
  slug: string;
  orderId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart();
  const { customer, token: sessionToken, loading: authLoading } = useCustomer();
  // Link do e-mail de quem comprou sem cadastro: `?t=` é um token assinado,
  // válido 90 dias e restrito a ESTE pedido.
  const linkToken = searchParams.get('t');
  const token = linkToken || sessionToken;
  const guestAccess = Boolean(linkToken && !customer);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [error, setError] = useState('');
  const [payError, setPayError] = useState('');
  const [paySession, setPaySession] = useState<PaySession | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(
    () => searchParams.get('status') === 'aguardando',
  );
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [offlinePay, setOfflinePay] = useState<OfflinePaymentInfo | null>(null);
  const [retryPay, setRetryPay] = useState(false);
  const clearedCart = useRef(false);
  const wasPaid = useRef(false);

  const loadOrder = useCallback(async () => {
    if (!token) return null;
    try {
      const o = await api<OrderLite>(`/storefront/orders/${orderId}`, {
        token,
        storeSlug: slug,
      });
      setOrder(o);
      setError('');
      return o;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
      return null;
    }
  }, [token, orderId, slug]);

  useEffect(() => {
    if (authLoading) return;
    // Com token no link não há para onde redirecionar — o convidado não tem conta
    if (!customer && !linkToken) {
      router.replace(
        `/loja/${slug}/conta/entrar?next=${encodeURIComponent(
          `/loja/${slug}/pedido/${orderId}`,
        )}`,
      );
    }
  }, [authLoading, customer, linkToken, router, slug, orderId]);

  const paid =
    order?.paymentStatus === 'APPROVED' ||
    ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(
      order?.status || '',
    );
  const rejected =
    order?.paymentStatus === 'REJECTED' && !retryPay;
  const pendingPay =
    order &&
    ((order.paymentStatus === 'PENDING' && order.status === 'PENDING') ||
      retryPay);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function tick() {
      const o = await loadOrder();
      if (cancelled || !o) return;
      const isPaid =
        o.paymentStatus === 'APPROVED' ||
        ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status);
      if (isPaid) {
        setAwaitingWebhook(false);
        setWatchingPayment(false);
        setOfflinePay(null);
        setRetryPay(false);
        if (!clearedCart.current) {
          clearedCart.current = true;
          cart.clear();
        }
        if (!wasPaid.current) {
          wasPaid.current = true;
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (url.searchParams.has('status')) {
              url.searchParams.delete('status');
              window.history.replaceState({}, '', url.pathname);
            }
          }
        }
      }
    }

    void tick();
    const ms = awaitingWebhook || watchingPayment || pendingPay ? 2000 : 5000;
    const timer = setInterval(() => {
      void tick();
    }, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadOrder, awaitingWebhook, watchingPayment]);

  const startPayment = useCallback(async () => {
    if (!token) return;
    if (!pendingPay && !retryPay) return;
    setLoadingPay(true);
    setPayError('');
    try {
      const pay = await api<PaySession>(`/checkout/orders/${orderId}/pay`, {
        method: 'POST',
        storeSlug: slug,
        token,
      });

      if (pay.mode === 'pro') {
        const isMpTest = Boolean(
          pay.publicKey?.trim().toUpperCase().startsWith('TEST-'),
        );
        const url = isMpTest
          ? pay.sandboxInitPoint || pay.initPoint
          : pay.initPoint || pay.sandboxInitPoint;
        if (url) {
          window.location.href = url;
          return;
        }
        setPayError(
          'Checkout Pro sem link de pagamento. Confira o Access Token no admin.',
        );
        return;
      }

      if (!pay.publicKey) {
        setPayError(
          'Public Key do Mercado Pago não configurada. O dono da loja precisa colar Access Token + Public Key em Admin → Configurações.',
        );
        return;
      }

      const ship = order?.shippingAddress;
      const payerAddress: BrickPayerAddress | undefined =
        ship?.zipCode && ship.street && ship.city && ship.state && ship.neighborhood
          ? {
              zipCode: ship.zipCode,
              street: ship.street,
              number: ship.number || 's/n',
              complement: ship.complement || undefined,
              neighborhood: ship.neighborhood,
              city: ship.city,
              state: ship.state,
            }
          : undefined;

      setPaySession({
        mode: 'personalized',
        publicKey: pay.publicKey,
        amount: Number(pay.amount ?? order?.total ?? 0),
        payerEmail: pay.payerEmail || customer?.email,
        payerName: pay.payerName || customer?.name,
        payerAddress,
      });
    } catch (err) {
      setPayError(
        err instanceof Error
          ? err.message
          : 'Não foi possível abrir o pagamento do Mercado Pago',
      );
      setPaySession(null);
    } finally {
      setLoadingPay(false);
    }
  }, [
    token,
    pendingPay,
    retryPay,
    orderId,
    slug,
    order?.total,
    order?.shippingAddress,
    customer?.email,
    customer?.name,
  ]);

  useEffect(() => {
    if (awaitingWebhook || paySession || loadingPay || payError) return;
    if (!pendingPay) return;
    if (searchParams.get('status') === 'aguardando' && !retryPay) return;
    void startPayment();
  }, [
    pendingPay,
    awaitingWebhook,
    paySession,
    loadingPay,
    payError,
    startPayment,
    searchParams,
    retryPay,
  ]);

  if (authLoading || (!customer && !guestAccess)) {
    return <p className="p-8 text-sm text-muted">Carregando...</p>;
  }

  if (paid) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <PaymentStatusScreen
          mode="success"
          orderNumber={order?.orderNumber}
          total={order?.total}
          storeSlug={slug}
          orderId={orderId}
        />
      </main>
    );
  }

  if (rejected) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <PaymentStatusScreen
            mode="rejected"
            orderNumber={order?.orderNumber}
            total={order?.total}
            storeSlug={slug}
            orderId={orderId}
          />
          <button
            type="button"
            className="btn btn-accent mt-2"
            onClick={() => {
              setRetryPay(true);
              setAwaitingWebhook(false);
              setPaySession(null);
              setOfflinePay(null);
              setPayError('');
            }}
          >
            Tentar pagar de novo
          </button>
        </div>
      </main>
    );
  }

  if (awaitingWebhook && !retryPay && !offlinePay) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <PaymentStatusScreen
          mode="waiting"
          orderNumber={order?.orderNumber}
          total={order?.total}
          storeSlug={slug}
          orderId={orderId}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Link href={`/loja/${slug}`} className="text-sm text-muted">
        ← Voltar à loja
      </Link>

      <div className="mt-4 border border-line bg-white p-5">
        {!order && !error ? (
          <p className="text-sm text-muted">Carregando pedido...</p>
        ) : null}
        {error ? <p className="text-sm text-accent">{error}</p> : null}

        {order && pendingPay ? (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">
              Pagar pedido #{order.orderNumber}
            </h1>
            <p className="text-sm text-muted">
              Total {money(order.total)}. Escolha Pix ou cartão no
              checkout real do Mercado Pago.
            </p>

            {payError ? (
              <div className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Pagamento indisponível</p>
                <p className="mt-1">{payError}</p>
                <button
                  type="button"
                  className="btn btn-ghost mt-3 text-sm"
                  onClick={() => {
                    setPayError('');
                    void startPayment();
                  }}
                >
                  Tentar de novo
                </button>
              </div>
            ) : null}

            {loadingPay && !paySession ? (
              <p className="text-sm text-muted">Abrindo Mercado Pago...</p>
            ) : null}

            {paySession?.mode === 'personalized' && paySession.publicKey ? (
              <>
                {offlinePay ? (
                  <OfflinePaymentPanel
                    info={offlinePay}
                    amount={paySession.amount}
                    orderLabel={
                      order ? `Pedido #${order.orderNumber}` : undefined
                    }
                  />
                ) : null}

                {!offlinePay ? (
                <MpPaymentBrick
                  publicKey={paySession.publicKey}
                  amount={paySession.amount}
                  payerEmail={paySession.payerEmail}
                  payerName={paySession.payerName}
                  payerAddress={paySession.payerAddress}
                  onError={(msg) => setPayError(msg)}
                  onSubmit={async (formData) => {
                    setBusy(true);
                    setPayError('');
                    try {
                      const result = await api<{
                        id?: number;
                        paymentId?: number;
                        approved?: boolean;
                        status?: string;
                        status_detail?: string;
                        orderId: string;
                        qrCode?: string | null;
                        qrCodeBase64?: string | null;
                        ticketUrl?: string | null;
                        digitableLine?: string | null;
                        barcode?: string | null;
                      }>(`/checkout/orders/${orderId}/pay-brick`, {
                        method: 'POST',
                        storeSlug: slug,
                        token,
                        body: { formData },
                      });

                      const paymentId = result.id ?? result.paymentId;
                      const status = result.status || '';

                      if (result.approved || status === 'approved') {
                        // Aprovado na hora (cartão): sucesso imediato, sem esperar webhook
                        setOfflinePay(null);
                        setWatchingPayment(false);
                        setAwaitingWebhook(false);
                        setRetryPay(false);
                        if (!clearedCart.current) {
                          cart.clear();
                          clearedCart.current = true;
                        }
                        await loadOrder();
                      } else if (
                        status === 'pending' ||
                        status === 'in_process'
                      ) {
                        setOfflinePay({
                          paymentId,
                          status,
                          qrCode: result.qrCode,
                          qrCodeBase64: result.qrCodeBase64,
                          ticketUrl: result.ticketUrl,
                          digitableLine: result.digitableLine,
                          barcode: result.barcode,
                        });
                        setWatchingPayment(true);
                        setAwaitingWebhook(true);
                        await loadOrder();
                      } else if (status === 'rejected') {
                        setRetryPay(false);
                        setPayError(
                          result.status_detail ||
                            'Pagamento recusado. Tente outro meio.',
                        );
                        await loadOrder();
                      }

                      setBusy(false);
                      return {
                        id: paymentId,
                        status,
                        status_detail: result.status_detail,
                      };
                    } catch (err) {
                      const msg =
                        err instanceof Error
                          ? err.message
                          : 'Pagamento recusado';
                      setPayError(msg);
                      setBusy(false);
                      throw err;
                    }
                  }}
                />
                ) : null}
                {busy ? (
                  <p className="text-xs text-muted">
                    Enviando ao Mercado Pago...
                  </p>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    onClick={() => {
                      setWatchingPayment(true);
                      setAwaitingWebhook(true);
                    }}
                  >
                    Já paguei — confirmar pagamento →
                  </button>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
