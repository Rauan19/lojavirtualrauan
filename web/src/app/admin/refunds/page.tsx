'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import {
  orderStatusLabel,
  paymentStatusLabel,
  refundStatusLabel,
} from '@/lib/order-status';

type RefundOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  customerName: string;
  customerEmail: string;
  refundReason?: string | null;
  refundStatus?: string | null;
  refundRequestedAt?: string | null;
  refundedAt?: string | null;
  mpPaymentId?: string | null;
  mpRefundId?: string | null;
  createdAt: string;
  items: { productName: string; quantity: number }[];
};

const PAGE_SIZE = 10;

export default function AdminRefundsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<RefundOrder[]>([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  const load = useCallback(async () => {
    const { token, storeSlug } = auth();
    if (!token) return;
    const data = await api<RefundOrder[]>(
      `/admin/refunds${showAll ? '?all=1' : ''}`,
      { token, storeSlug },
    );
    setItems(data);
    setPage(1);
  }, [showAll]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  async function approve(id: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    const ok = await confirm({
      title: 'Aprovar reembolso?',
      message:
        'O valor será estornado no gateway de pagamento quando estiver disponível.',
      confirmLabel: 'Aprovar e estornar',
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      const res = await api<{
        gateway: string;
        gatewayMessage: string;
      }>(`/admin/orders/${id}/refund/approve`, {
        method: 'POST',
        token,
        storeSlug,
      });
      setMessage(res.gatewayMessage || 'Reembolso aprovado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    const reason = window.prompt('Motivo da recusa (opcional)') || undefined;
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/admin/orders/${id}/refund/reject`, {
        method: 'POST',
        token,
        storeSlug,
        body: { reason },
      });
      setMessage('Solicitação recusada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Reembolsos</h1>
          <p className="text-sm text-muted">
            Solicitações do cliente. Ao aprovar, o sistema tenta estornar no
            Mercado Pago (ou registra localmente se o gateway ainda não estiver
            ligado).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Mostrar histórico
        </label>
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

      <ul className="space-y-3">
        {paged.map((order) => (
          <li key={order.id} className="card !p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">
                  Pedido #{order.orderNumber} · {money(order.total)}
                </p>
                <p className="text-xs text-muted">
                  {order.customerName} · {order.customerEmail}
                </p>
                <p className="mt-1 text-sm">
                  {orderStatusLabel(order.status)} ·{' '}
                  {paymentStatusLabel(order.paymentStatus)}
                </p>
                {refundStatusLabel(order.refundStatus) ? (
                  <p className="text-xs font-medium">
                    {refundStatusLabel(order.refundStatus)}
                  </p>
                ) : null}
                {order.refundReason ? (
                  <p className="mt-1 text-xs text-muted">
                    Motivo: {order.refundReason}
                  </p>
                ) : null}
                {order.refundRequestedAt ? (
                  <p className="text-[11px] text-muted">
                    Solicitado em{' '}
                    {new Date(order.refundRequestedAt).toLocaleString('pt-BR')}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">
                  Itens:{' '}
                  {order.items
                    .map((i) => `${i.quantity}× ${i.productName}`)
                    .join(', ')}
                </p>
                {order.mpPaymentId ? (
                  <p className="text-[11px] text-muted">
                    MP payment: {order.mpPaymentId}
                    {order.mpRefundId ? ` · refund: ${order.mpRefundId}` : ''}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted">
                    Sem payment id MP — não dá para estornar no gateway (pedido seed/offline)
                  </p>
                )}
              </div>
              {order.refundStatus === 'REQUESTED' ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn btn-accent"
                    disabled={busyId === order.id}
                    onClick={() => approve(order.id)}
                  >
                    {busyId === order.id ? '...' : 'Aprovar e estornar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === order.id}
                    onClick={() => reject(order.id)}
                  >
                    Recusar
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-sm text-muted">
            {showAll
              ? 'Nenhum reembolso no histórico.'
              : 'Nenhuma solicitação pendente.'}
          </li>
        ) : null}
      </ul>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={items.length}
        label="reembolsos"
        onPageChange={setPage}
      />
      {confirmDialog}
    </div>
  );
}
