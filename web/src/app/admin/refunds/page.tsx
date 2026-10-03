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
import { CabecalhoPagina, EstadoVazio, Selo } from '@/components/admin/Pagina';

/** Cor do selo pelo andamento do reembolso */
function tomDoReembolso(status?: string | null) {
  if (!status) return 'neutro' as const;
  if (status.includes('REJECT')) return 'erro' as const;
  if (status === 'REQUESTED') return 'alerta' as const;
  if (status.includes('RETURN')) return 'info' as const;
  return 'ok' as const;
}

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
  const { confirm, ask, dialog: confirmDialog } = useConfirm();
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
    load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Erro'),
    );
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
      setMessage(
        res.gatewayMessage || 'Devolução confirmada e valor estornado',
      );
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
    const motivo = await ask({
      title: 'Recusar a solicitação?',
      message:
        'O cliente recebe um e-mail avisando. O motivo aparece para ele.',
      confirmLabel: 'Recusar',
      danger: true,
      field: {
        label: 'Motivo da recusa (opcional)',
        type: 'textarea',
        placeholder: 'Ex.: o prazo de 7 dias para desistência já passou.',
      },
    });
    if (motivo === null) return;
    const reason = motivo.trim() || undefined;
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
    <div className="admin-page">
      <CabecalhoPagina
        icone="/admin/refunds"
        titulo="Reembolsos"
        descricao="Pedidos de devolução e reembolso dos clientes. Ao aprovar, o valor volta para o cliente pelo Mercado Pago."
        acoes={
          <div
            className="inline-flex rounded-xl border border-line bg-white p-1"
            role="group"
            aria-label="Mostrar"
          >
            {(
              [
                [false, 'Pendentes'],
                [true, 'Histórico'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={rotulo}
                type="button"
                aria-pressed={showAll === valor}
                className={`h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                  showAll === valor
                    ? 'bg-[var(--brand-deep)] text-white'
                    : 'text-muted hover:bg-[#f3f5f7] hover:text-ink'
                }`}
                onClick={() => setShowAll(valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

      <ul className="space-y-3">
        {paged.map((order) => (
          <li
            key={order.id}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-bold">
                    Pedido #{order.orderNumber}
                  </p>
                  <span className="text-[15px] font-bold tabular-nums">
                    {money(order.total)}
                  </span>
                  {refundStatusLabel(order.refundStatus) ? (
                    <Selo tom={tomDoReembolso(order.refundStatus)}>
                      {refundStatusLabel(order.refundStatus)}
                    </Selo>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {order.customerName} · {order.customerEmail}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {orderStatusLabel(order.status)} ·{' '}
                  {paymentStatusLabel(order.paymentStatus)}
                </p>
                {order.refundReasonType || order.refundReason ? (
                  <div className="mt-3 rounded-xl bg-[#f6f8fa] px-3.5 py-2.5">
                    {order.refundReasonType ? (
                      <p className="text-[13px] font-semibold">
                        {MOTIVO_LABEL[order.refundReasonType] ||
                          order.refundReasonType}
                        {order.exigeDevolucao ? ' · exige devolução' : ''}
                      </p>
                    ) : null}
                    {order.refundReason ? (
                      <p className="mt-0.5 text-[13px] text-muted">
                        “{order.refundReason}”
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {order.refundReasonType === 'ARREPENDIMENTO' &&
                order.podeRecusar === false ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
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
                  <p className="mt-1 text-[11px] text-muted">
                    Pagamento no Mercado Pago: {order.mpPaymentId}
                    {order.mpRefundId ? ` · estorno: ${order.mpRefundId}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">
                    Este pedido não foi pago pelo Mercado Pago: devolva o valor
                    ao cliente por fora (Pix ou transferência).
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
                      ? 'Aguarde…'
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
                      ? 'Aguarde…'
                      : 'Recebi o produto — estornar'}
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-2xl border border-line bg-white">
            <EstadoVazio
              icone="/admin/refunds"
              titulo={
                showAll
                  ? 'Nenhum reembolso no histórico'
                  : 'Nenhum pedido de reembolso'
              }
              texto={
                showAll
                  ? 'Reembolsos aprovados ou recusados aparecem aqui.'
                  : 'Quando um cliente pedir devolução ou reembolso, ele aparece aqui para você aprovar.'
              }
            />
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
