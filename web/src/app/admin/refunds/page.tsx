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
  refundReasonType?: string | null;
  refundRequestedAt?: string | null;
  returnReceivedAt?: string | null;
  /** Vem calculado da API: ver refund-rules.ts */
  exigeDevolucao?: boolean;
  podeRecusar?: boolean;
  prazoArrependimento?: string | null;
  refundedAt?: string | null;
  mpPaymentId?: string | null;
  mpRefundId?: string | null;
  createdAt: string;
  items: { productName: string; quantity: number }[];
};

const MOTIVO_LABEL: Record<string, string> = {
  ARREPENDIMENTO: 'Desistiu da compra',
  DEFEITO: 'Produto com defeito',
  NAO_RECEBI: 'Não recebeu o produto',
  OUTRO: 'Outro motivo',
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
    const order = items.find((o) => o.id === id);
    const comDevolucao = Boolean(order?.exigeDevolucao);
    const ok = await confirm({
      title: comDevolucao ? 'Autorizar devolução?' : 'Aprovar reembolso?',
      message: comDevolucao
        ? 'O cliente é avisado com as instruções e o pedido passa a aguardar o produto. O dinheiro só sai depois que você confirmar o recebimento.'
        : 'O valor será estornado agora no gateway de pagamento.',
      confirmLabel: comDevolucao ? 'Autorizar devolução' : 'Aprovar e estornar',
      danger: !comDevolucao,
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
      setMessage(res.gatewayMessage || 'Solicitação aprovada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar');
    } finally {
      setBusyId(null);
    }
  }

  /** Produto voltou: confirma o recebimento e dispara o estorno. */
  async function confirmarDevolucao(id: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    const ok = await confirm({
      title: 'Confirmar que o produto voltou?',
      message:
        'O estorno é enviado ao gateway agora e os itens voltam para o estoque. Não tem desfazer.',
      confirmLabel: 'Recebi — estornar',
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      const res = await api<{ gatewayMessage?: string }>(
        `/admin/orders/${id}/refund/return-received`,
        { method: 'POST', token, storeSlug },
      );
      setMessage(res.gatewayMessage || 'Devolução confirmada e valor estornado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar');
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
                {order.refundReasonType ? (
                  <p className="mt-1 text-xs font-medium">
                    {MOTIVO_LABEL[order.refundReasonType] ||
                      order.refundReasonType}
                    {order.exigeDevolucao ? ' · exige devolução' : ''}
                  </p>
                ) : null}
                {order.refundReason ? (
                  <p className="mt-0.5 text-xs text-muted">
                    “{order.refundReason}”
                  </p>
                ) : null}
                {order.refundReasonType === 'ARREPENDIMENTO' &&
                order.podeRecusar === false ? (
                  <p className="mt-1 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-950">
                    Desistência dentro dos 7 dias do recebimento é direito do
                    consumidor (CDC art. 49). Não pode ser recusada.
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
                    {busyId === order.id
                      ? '...'
                      : order.exigeDevolucao
                        ? 'Autorizar devolução'
                        : 'Aprovar e estornar'}
                  </button>
                  {/* recusar some quando a lei não permite recusar */}
                  {order.podeRecusar !== false ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === order.id}
                      onClick={() => reject(order.id)}
                    >
                      Recusar
                    </button>
                  ) : null}
                </div>
              ) : null}
              {order.refundStatus === 'RETURN_PENDING' ? (
                <div className="flex flex-col gap-2">
                  <p className="max-w-[240px] text-[11px] leading-snug text-muted">
                    Aguardando o produto voltar. O estorno sai quando você
                    confirmar o recebimento.
                  </p>
                  <button
                    type="button"
                    className="btn btn-accent"
                    disabled={busyId === order.id}
                    onClick={() => confirmarDevolucao(order.id)}
                  >
                    {busyId === order.id
                      ? '...'
                      : 'Recebi o produto — estornar'}
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
