'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { useCustomer } from '@/components/CustomerProvider';
import { OrderTrackingPanel } from '@/components/OrderTracking';
import { api, mediaUrl, money } from '@/lib/api';
import { sellerWhatsappHref } from '@/lib/contact';
import {
  StatusBadge,
  orderStatusLabel,
  refundStatusLabel,
} from '@/lib/order-status';

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
  subtotal: string | number;
  shippingCost: string | number;
  discount: string | number;
  total: string | number;
  shippingMethod?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  createdAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  updatedAt?: string;
  refundStatus?: string | null;
  refundReason?: string | null;
  items: OrderItem[];
};

/** Reembolso pelo cliente — desligado por enquanto; ativar quando for usar. */
const REFUND_REQUEST_ENABLED = false;

function firstImageUrl(item: OrderItem) {
  const imgs = item.product?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const sorted = [...imgs].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return mediaUrl(sorted[0]?.url);
}

export default function PedidoDetalhePage() {
  const params = useParams<{ slug: string; orderId: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { customer, token, loading } = useCustomer();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [reasonType, setReasonType] = useState('ARREPENDIMENTO');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sellerPhone, setSellerPhone] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    if (!token) return;
    api<Order>(`/storefront/orders/${params.orderId}`, {
      token,
      storeSlug: params.slug,
    })
      .then(setOrder)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, [token, params.slug, params.orderId]);

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

  async function requestRefund(e: FormEvent) {
    e.preventDefault();
    if (!token || !order) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Order>(
        `/storefront/orders/${order.id}/refund-request`,
        {
          method: 'POST',
          token,
          storeSlug: params.slug,
          body: { reasonType, reason: reason || undefined },
        },
      );
      setOrder(updated);
      setMessage('Solicitação de reembolso enviada. Aguarde a loja analisar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !customer) {
    return null;
  }

  if (!order && !error) {
    return <p className="p-4 text-sm text-muted md:p-0">Carregando pedido...</p>;
  }

  const canRequestRefund =
    REFUND_REQUEST_ENABLED &&
    order &&
    order.paymentStatus === 'APPROVED' &&
    order.status !== 'REFUNDED' &&
    order.refundStatus !== 'REQUESTED' &&
    order.refundStatus !== 'APPROVED';

  const refundLabel = order ? refundStatusLabel(order.refundStatus) : null;
  const sellerWa =
    sellerPhone && order
      ? sellerWhatsappHref(
          sellerPhone,
          `Olá! Sou cliente da loja ${storeName || params.slug}. Quero falar sobre o pedido #${order.orderNumber}.`,
        )
      : null;

  return (
    <main className="px-4 py-6 md:px-0 md:py-0">
      <Link
        href={`/loja/${params.slug}/conta/pedidos`}
        className="text-sm text-muted"
      >
        ← Minhas compras
      </Link>

      {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-[var(--ok)]">{message}</p> : null}

      {order ? (
        <>
          <h1 className="mt-4 text-xl font-bold">Pedido #{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(order.createdAt).toLocaleString('pt-BR')}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border border-line bg-white p-3">
            <p className="text-sm font-semibold">
              <span className="text-muted">Status: </span>
              {order.paymentStatus === 'PENDING' && order.status === 'PENDING'
                ? 'Aguardando pagamento'
                : orderStatusLabel(order.status)}
            </p>
            {order.paymentStatus !== 'APPROVED' &&
            !(order.paymentStatus === 'PENDING' && order.status === 'PENDING') ? (
              <StatusBadge status={order.paymentStatus} kind="payment" />
            ) : null}
            {refundLabel ? (
              <span className="inline-flex items-center rounded bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">
                {refundLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <OrderTrackingPanel order={order} />
          </div>

          {order.status === 'SHIPPED' || order.status === 'PROCESSING' ? (
            <button
              type="button"
              className="btn mt-3 w-full justify-center py-2"
              disabled={busy}
              onClick={async () => {
                if (!token) return;
                const ok = await confirm({
                  title: 'Pedido recebido?',
                  message:
                    'Confirme só se o pacote já chegou em suas mãos.',
                  confirmLabel: 'Sim, recebi',
                });
                if (!ok) return;
                setBusy(true);
                setError('');
                try {
                  const updated = await api<Order>(
                    `/storefront/orders/${order.id}/confirm-delivery`,
                    {
                      method: 'POST',
                      token,
                      storeSlug: params.slug,
                    },
                  );
                  setOrder(updated);
                  setMessage('Obrigado! Pedido marcado como entregue.');
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Erro ao confirmar',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Recebi o pedido
            </button>
          ) : null}

          {sellerWa ? (
            <a
              href={sellerWa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost mt-3 flex w-full items-center justify-center gap-1.5 py-2"
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

          <ul className="mt-4 space-y-2">
            {order.items.map((item) => {
              const img = firstImageUrl(item);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b border-line py-2 text-sm"
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={item.productName}
                      className="h-14 w-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] text-muted">
                      Sem foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.productName}</p>
                    <p className="text-xs text-muted">
                      {item.quantity}×{' '}
                      <span className="text-sky-700">{money(item.unitPrice)}</span>
                    </p>
                  </div>
                  <strong className="shrink-0 text-emerald-700">
                    {money(item.total)}
                  </strong>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="font-medium text-sky-800">{money(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 ? (
              <div className="flex justify-between font-medium text-emerald-700">
                <span>Desconto</span>
                <span>−{money(order.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted">Frete</span>
              <span
                className={
                  Number(order.shippingCost) === 0
                    ? 'font-medium text-emerald-700'
                    : 'font-medium text-amber-800'
                }
              >
                {Number(order.shippingCost) === 0
                  ? 'Grátis'
                  : money(order.shippingCost)}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <span>Total</span>
              <span className="text-emerald-700">{money(order.total)}</span>
            </div>
          </div>

          {canRequestRefund ? (
            <form onSubmit={requestRefund} className="mt-6 space-y-3 border border-line p-3">
              <p className="text-sm font-bold">Solicitar reembolso</p>
              {/*
                O motivo não é só informação: decide se o produto precisa
                voltar e se a loja pode recusar. Desistir dentro de 7 dias é
                direito (CDC art. 49) e a loja não pode negar.
              */}
              <div className="space-y-1.5">
                {[
                  ['ARREPENDIMENTO', 'Desisti da compra', 'Até 7 dias do recebimento. A loja não pode recusar e paga o frete da volta.'],
                  ['DEFEITO', 'Produto com defeito', 'Garantia legal de 30 ou 90 dias, conforme o tipo de produto.'],
                  ['NAO_RECEBI', 'Não recebi o produto', 'A loja vai apurar com a transportadora.'],
                  ['OUTRO', 'Outro motivo', 'Descreva abaixo o que aconteceu.'],
                ].map(([valor, titulo, ajuda]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer gap-2 border p-2 text-[13px] ${
                      reasonType === valor
                        ? 'border-[var(--store-accent)] bg-[color-mix(in_srgb,var(--store-accent)_6%,transparent)]'
                        : 'border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      name="motivo"
                      className="mt-0.5 shrink-0"
                      checked={reasonType === valor}
                      onChange={() => setReasonType(valor)}
                    />
                    <span>
                      <span className="font-semibold">{titulo}</span>
                      <span className="block text-[11px] leading-snug text-muted">
                        {ajuda}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <textarea
                className="field min-h-[72px]"
                placeholder="Conte o que aconteceu (opcional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                type="submit"
                className="w-full rounded border border-orange-600 bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                disabled={busy}
              >
                {busy ? 'Enviando...' : 'Pedir reembolso'}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {confirmDialog}
    </main>
  );
}
