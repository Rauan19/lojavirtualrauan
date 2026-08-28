'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { useCustomer } from '@/components/CustomerProvider';
import { OrderTrackingPanel } from '@/components/OrderTracking';
import { PaginationBar } from '@/components/PaginationBar';
import { api, mediaUrl, money } from '@/lib/api';
import { sellerWhatsappHref } from '@/lib/contact';
import {
  StatusBadge,
  orderStatusLabel,
  refundStatusLabel,
} from '@/lib/order-status';
import { buildTrackingSteps, resolveTrackingUrl } from '@/lib/tracking';

type ProductImage = { url?: string; position?: number };

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string | number;
  total: string | number;
  product?: {
    id: string;
    slug?: string | null;
    images?: ProductImage[] | null;
  } | null;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  createdAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  updatedAt?: string;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  shippingMethod?: string | null;
  refundStatus?: string | null;
  items: OrderItem[];
};

type ListResponse = {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_SIZE = 8;

function firstImageUrl(item: OrderItem) {
  const imgs = item.product?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const sorted = [...imgs].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return mediaUrl(sorted[0]?.url);
}

function currentShipLabel(order: Order) {
  const steps = buildTrackingSteps(order);
  const current = steps.find((s) => s.current) || steps.filter((s) => s.done).at(-1);
  return current?.label || orderStatusLabel(order.status);
}

/** Reembolso pelo cliente — desligado por enquanto; ativar quando for usar. */
const REFUND_REQUEST_ENABLED = false;

function canRequestRefund(order: Order) {
  if (!REFUND_REQUEST_ENABLED) return false;
  return (
    order.paymentStatus === 'APPROVED' &&
    order.status !== 'REFUNDED' &&
    order.refundStatus !== 'REQUESTED' &&
    order.refundStatus !== 'APPROVED'
  );
}

export default function MeusPedidosPage() {
  const params = useParams<{ slug: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { customer, token, loading } = useCustomer();
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fetching, setFetching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sellerPhone, setSellerPhone] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    api<{ name?: string; sellerPhone?: string | null }>(
      `/stores/public/${params.slug}`,
    )
      .then((s) => {
        setSellerPhone(s.sellerPhone?.trim() || null);
        setStoreName(s.name || '');
      })
      .catch(() => undefined);
  }, [params.slug]);

  async function confirmDelivery(orderId: string) {
    if (!token) return;
    const ok = await confirm({
      title: 'Pedido recebido?',
      message: 'Confirme só se o pacote já chegou em suas mãos.',
      confirmLabel: 'Sim, recebi',
    });
    if (!ok) return;
    setBusyId(orderId);
    setError('');
    setMessage('');
    try {
      const updated = await api<Order>(
        `/storefront/orders/${orderId}/confirm-delivery`,
        { method: 'POST', token, storeSlug: params.slug },
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar');
    } finally {
      setBusyId(null);
    }
  }

  async function requestRefund(order: Order) {
    if (!token || !canRequestRefund(order)) return;
    const ok = await confirm({
      title: 'Pedir reembolso?',
      message:
        'A loja vai analisar sua solicitação. Se aprovar, o valor é estornado pelo Mercado Pago.',
      confirmLabel: 'Pedir reembolso',
    });
    if (!ok) return;
    setBusyId(order.id);
    setError('');
    setMessage('');
    try {
      const updated = await api<Order>(
        `/storefront/orders/${order.id}/refund-request`,
        {
          method: 'POST',
          token,
          storeSlug: params.slug,
          body: {},
        },
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, ...updated } : o)),
      );
      setMessage(
        `Reembolso do pedido #${order.orderNumber} enviado. Aguarde a loja analisar.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    api<ListResponse>(
      `/storefront/orders?page=${page}&limit=${PAGE_SIZE}`,
      { token, storeSlug: params.slug },
    )
      .then((data) => {
        setOrders(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setFetching(false));
  }, [token, params.slug, page]);

  if (loading || !customer) {
    return null;
  }

  return (
    <main className="px-4 py-6 pb-8 md:px-0 md:py-0">
      <h1 className="text-xl font-bold">Minhas compras</h1>
      <p className="mt-1 text-sm text-muted">
        Status do envio aparece aqui. Use Ver mais para rastreio e detalhes.
        Pedidos sem pagar expiram em 1 hora.
      </p>

      {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
      {message ? (
        <p className="mt-3 text-sm text-[var(--ok)]">{message}</p>
      ) : null}
      {fetching ? (
        <p className="mt-3 text-xs text-muted">Atualizando...</p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {orders.map((order) => {
          const thumbs = order.items
            .map((item) => ({
              id: item.id,
              url: firstImageUrl(item),
              name: item.productName,
            }))
            .filter((t) => t.url);
          const refundLabel = refundStatusLabel(order.refundStatus);
          const awaitingPay =
            order.paymentStatus === 'PENDING' && order.status === 'PENDING';
          const expanded = expandedId === order.id;
          const shipLabel = currentShipLabel(order);
          const steps = buildTrackingSteps(order);
          const trackUrl = resolveTrackingUrl(
            order.trackingCode,
            order.trackingUrl,
            order.shippingMethod,
          );
          const sellerWa = sellerPhone
            ? sellerWhatsappHref(
                sellerPhone,
                `Olá! Sou cliente da loja ${storeName || params.slug}. Quero falar sobre o pedido #${order.orderNumber}.`,
              )
            : null;

          return (
            <li
              key={order.id}
              className={`border bg-white transition ${
                awaitingPay ? 'border-amber-300' : 'border-line'
              }`}
            >
              <div className="p-3">
                <div className="flex gap-3">
                  <div className="flex shrink-0">
                    {thumbs.length > 0 ? (
                      <div className="relative flex h-16 w-16">
                        {thumbs.slice(0, 3).map((t, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={t.id}
                            src={t.url!}
                            alt={t.name}
                            className="absolute h-16 w-16 rounded object-cover ring-2 ring-white"
                            style={{
                              left: i * 6,
                              zIndex: 3 - i,
                              opacity: i === 0 ? 1 : 0.92,
                            }}
                          />
                        ))}
                        {order.items.length > 3 ? (
                          <span className="absolute bottom-0 right-0 z-10 rounded bg-ink/80 px-1 text-[10px] font-bold text-white">
                            +{order.items.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded bg-zinc-100 text-[10px] font-medium text-muted">
                        Sem foto
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {awaitingPay
                            ? `Pagar pedido #${order.orderNumber}`
                            : `Pedido #${order.orderNumber}`}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(order.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <strong
                        className={`shrink-0 text-sm font-bold ${
                          awaitingPay ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {money(order.total)}
                      </strong>
                    </div>

                    {/* Status de envio sempre visível */}
                    <div className="mt-2">
                      {awaitingPay ? (
                        <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                          Aguardando pagamento
                        </span>
                      ) : (
                        <p className="text-sm font-semibold text-ink">
                          <span className="text-muted">Status: </span>
                          {shipLabel}
                        </p>
                      )}
                    </div>

                    {/* Mini timeline */}
                    {!awaitingPay ? (
                      <div
                        className="mt-2.5 flex items-center gap-1"
                        aria-hidden
                      >
                        {steps.map((step, i) => (
                          <div key={step.key} className="flex flex-1 items-center gap-1">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                step.done
                                  ? 'bg-emerald-500'
                                  : step.current
                                    ? 'bg-amber-400'
                                    : 'bg-zinc-300'
                              }`}
                              title={step.label}
                            />
                            {i < steps.length - 1 ? (
                              <span
                                className={`h-0.5 flex-1 ${
                                  step.done ? 'bg-emerald-400' : 'bg-zinc-200'
                                }`}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {/* Só mostra badge de pagamento se NÃO estiver ok (recusado/estorno) */}
                      {!awaitingPay &&
                      order.paymentStatus !== 'APPROVED' ? (
                        <StatusBadge
                          status={order.paymentStatus}
                          kind="payment"
                        />
                      ) : null}
                      {refundLabel ? (
                        <span className="inline-flex items-center rounded bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">
                          {refundLabel}
                        </span>
                      ) : null}
                      {order.trackingCode ? (
                        <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-900 ring-1 ring-indigo-200">
                          Código de rastreio: {order.trackingCode}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 truncate text-xs text-muted">
                      {order.items.length === 1
                        ? order.items[0].productName
                        : `${order.items.length} itens · ${order.items[0]?.productName}${order.items.length > 1 ? '…' : ''}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {awaitingPay ? (
                    <Link
                      href={`/loja/${params.slug}/pedido/${order.id}`}
                      className="btn btn-accent flex-1 justify-center py-2 text-sm"
                    >
                      Pagar agora
                    </Link>
                  ) : (
                    <>
                      {trackUrl ? (
                        <a
                          href={trackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-accent flex-1 justify-center py-2 text-sm"
                        >
                          Rastrear envio
                        </a>
                      ) : null}
                      {order.status === 'SHIPPED' ||
                      order.status === 'PROCESSING' ? (
                        <button
                          type="button"
                          className="btn flex-1 justify-center py-2 text-sm"
                          disabled={busyId === order.id}
                          onClick={() => void confirmDelivery(order.id)}
                        >
                          {busyId === order.id ? '...' : 'Recebi o pedido'}
                        </button>
                      ) : null}
                      {canRequestRefund(order) ? (
                        <button
                          type="button"
                          className="flex flex-1 items-center justify-center rounded border border-orange-600 bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                          disabled={busyId === order.id}
                          onClick={() => void requestRefund(order)}
                        >
                          {busyId === order.id ? '...' : 'Pedir reembolso'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost flex-1 justify-center py-2 text-sm"
                        onClick={() =>
                          setExpandedId(expanded ? null : order.id)
                        }
                        aria-expanded={expanded}
                      >
                        {expanded ? 'Ver menos' : 'Ver mais'}
                      </button>
                    </>
                  )}
                  {sellerWa ? (
                    <a
                      href={sellerWa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost flex-1 justify-center gap-1.5 py-2 text-sm"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                        className="text-[#128C7E]"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Falar com vendedor
                    </a>
                  ) : null}
                </div>
              </div>

              {expanded && !awaitingPay ? (
                <div className="space-y-3 border-t border-line bg-[#fafafa] p-3">
                  <OrderTrackingPanel order={order} />

                  <div className="border border-line bg-white p-3">
                    <p className="text-xs font-bold uppercase text-muted">
                      Itens
                    </p>
                    <ul className="mt-2 space-y-2">
                      {order.items.map((item) => {
                        const img = firstImageUrl(item);
                        return (
                          <li
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt=""
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-zinc-100" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {item.productName}
                              </p>
                              <p className="text-xs text-muted">
                                {item.quantity}× {money(item.unitPrice)}
                              </p>
                            </div>
                            <strong className="shrink-0 text-xs">
                              {money(item.total)}
                            </strong>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <Link
                    href={`/loja/${params.slug}/conta/pedidos/${order.id}`}
                    className="btn btn-ghost inline-flex w-full justify-center text-sm"
                  >
                    Abrir página completa do pedido →
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
        {orders.length === 0 ? (
          <li className="text-sm text-muted">
            Você ainda não tem compras.{' '}
            <Link href={`/loja/${params.slug}`} className="underline">
              Ir à loja
            </Link>
          </li>
        ) : null}
      </ul>

      <PaginationBar
        className="mt-4"
        page={page}
        totalPages={totalPages}
        total={total}
        label="pedidos"
        onPageChange={(next) => {
          setPage(next);
          setExpandedId(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {confirmDialog}
    </main>
  );
}
