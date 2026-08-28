'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api, mediaUrl, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import {
  StatusBadge,
  orderStatusLabel,
} from '@/lib/order-status';
import {
  getPrintedIds,
  markPrinted,
  printOrderResult,
  type PrintResult,
} from '@/lib/print';

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string | number;
  total: string | number;
  sku?: string | null;
  product?: {
    images?: { url: string }[];
  } | null;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  subtotal?: string | number;
  shippingCost?: string | number;
  discount?: string | number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  shippingMethod?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  carrierShipmentId?: string | null;
  labelUrl?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  createdAt: string;
  notes?: string | null;
  items?: OrderItem[];
};

type InvoiceInfo = {
  id: string;
  status: string;
  number?: number | null;
  series?: string | null;
  accessKey?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  errorMessage?: string | null;
  issuedAt?: string | null;
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Processando',
  AUTHORIZED: 'Autorizada',
  CANCELLED: 'Cancelada',
  REJECTED: 'Rejeitada',
  ERROR: 'Erro',
};

type ListResponse = {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

type PrinterConfig = {
  printerType: 'BROWSER' | 'NETWORK' | 'BLUETOOTH';
  printerHost?: string | null;
  printerPort?: number;
  printerName?: string | null;
  printerAutoPrint: boolean;
  printerPaperWidth: number;
  autoDeliverDays: number;
};

const STATUS_FILTER = [
  'PENDING',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

function isOrderPaid(order: { paymentStatus: string }) {
  return order.paymentStatus === 'APPROVED';
}

function formatAddress(addr?: Record<string, unknown> | null) {
  if (!addr) return null;
  const street = String(addr.street || '');
  const number = String(addr.number || '');
  const complement = addr.complement ? String(addr.complement) : '';
  const neighborhood = String(addr.neighborhood || '');
  const city = String(addr.city || '');
  const state = String(addr.state || '');
  const zip = String(addr.zipCode || '');
  return [
    [street, number].filter(Boolean).join(', '),
    complement,
    neighborhood,
    [city, state].filter(Boolean).join('/'),
    zip ? `CEP ${zip}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function AdminOrdersPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Order | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [printer, setPrinter] = useState<PrinterConfig>({
    printerType: 'BROWSER',
    printerHost: '',
    printerPort: 9100,
    printerName: '',
    printerAutoPrint: false,
    printerPaperWidth: 80,
    autoDeliverDays: 15,
  });

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  const load = useCallback(
    async (nextQ = q, nextStatus = status, nextPage = page) => {
      const { token, storeSlug } = auth();
      if (!token) return;
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(PAGE_SIZE));
      if (nextQ) params.set('q', nextQ);
      if (nextStatus) params.set('status', nextStatus);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const data = await api<ListResponse>(`/admin/orders?${params}`, {
        token,
        storeSlug,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages || 1);
      setSelected(new Set());
      return data.items;
    },
    [q, status, from, to, page],
  );

  async function loadPrinter() {
    const { token, storeSlug } = auth();
    if (!token) return;
    const store = await api<PrinterConfig & { id: string }>('/stores/me', {
      token,
      storeSlug,
    });
    setPrinter({
      printerType: (store.printerType as PrinterConfig['printerType']) || 'BROWSER',
      printerHost: store.printerHost || '',
      printerPort: store.printerPort || 9100,
      printerName: store.printerName || '',
      printerAutoPrint: !!store.printerAutoPrint,
      printerPaperWidth: store.printerPaperWidth || 80,
      autoDeliverDays:
        typeof store.autoDeliverDays === 'number' ? store.autoDeliverDays : 15,
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
    loadPrinter().catch(() => undefined);
  }, [load]);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((o) => selected.has(o.id)),
    [items, selected],
  );

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((o) => o.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePrint(orderId: string, silent = false) {
    const { token, storeSlug } = auth();
    if (!token) return;
    const fromList = items.find((o) => o.id === orderId);
    const fromDetail = detail?.id === orderId ? detail : null;
    const order = fromDetail || fromList;
    if (order && !isOrderPaid(order)) {
      if (!silent) {
        setError('Só é possível imprimir pedidos pagos');
      }
      return;
    }
    setBusyId(orderId);
    if (!silent) {
      setError('');
      setMessage('');
    }
    try {
      const result = await api<PrintResult>(`/admin/orders/${orderId}/print`, {
        method: 'POST',
        token,
        storeSlug,
      });
      await printOrderResult(result);
      markPrinted(orderId);
      if (!silent) {
        setMessage(
          result.mode === 'NETWORK'
            ? 'Enviado para a impressora térmica (rede)'
            : 'Abrindo impressão no navegador...',
        );
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Erro ao imprimir');
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function bulkStatus(nextStatus: 'SHIPPED' | 'DELIVERED' | 'PROCESSING') {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm({
      title: 'Atualizar pedidos?',
      message: `Marcar ${ids.length} pedido(s) como ${orderStatusLabel(nextStatus)}?`,
      confirmLabel: 'Confirmar',
    });
    if (!ok) return;
    setBulkBusy(true);
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      const res = await api<{ updated: number; requested: number }>(
        '/admin/orders/bulk-status',
        {
          method: 'PATCH',
          token,
          storeSlug,
          body: { ids, status: nextStatus },
        },
      );
      setSelected(new Set());
      await load();
      setMessage(
        `${res.updated} de ${res.requested} atualizados para ${orderStatusLabel(nextStatus)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na atualização em massa');
    } finally {
      setBulkBusy(false);
    }
  }

  async function printSelected() {
    const paidIds = items
      .filter((o) => selected.has(o.id) && isOrderPaid(o))
      .map((o) => o.id);
    if (!paidIds.length) {
      setError('Selecione pelo menos um pedido pago para imprimir');
      return;
    }
    setBulkBusy(true);
    setError('');
    setMessage('');
    let ok = 0;
    try {
      for (const id of paidIds) {
        try {
          await handlePrint(id, true);
          ok += 1;
          // pausa entre cupons — térmica precisa digerir a fila
          await new Promise((r) =>
            setTimeout(r, printer.printerType === 'NETWORK' ? 900 : 400),
          );
        } catch {
          /* continua nos próximos */
        }
      }
      setMessage(
        ok === paidIds.length
          ? printer.printerType === 'NETWORK'
            ? `${ok} pedido(s) enviados para a térmica`
            : `${ok} pedido(s) pagos enviados para impressão`
          : `${ok} de ${paidIds.length} impressos (alguns falharam)`,
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function openDetail(id: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setDetailLoading(true);
    setError('');
    setInvoice(null);
    try {
      const order = await api<Order>(`/admin/orders/${id}`, { token, storeSlug });
      setDetail(order);
      try {
        const inv = await api<InvoiceInfo>(`/admin/orders/${id}/invoice`, {
          token,
          storeSlug,
        });
        setInvoice(inv);
      } catch {
        setInvoice(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir pedido');
    } finally {
      setDetailLoading(false);
    }
  }

  async function issueInvoice(orderId: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setInvoiceBusy(true);
    setError('');
    setMessage('');
    try {
      const inv = await api<InvoiceInfo>(`/admin/orders/${orderId}/invoice`, {
        method: 'POST',
        token,
        storeSlug,
      });
      setInvoice(inv);
      setMessage(
        inv.status === 'AUTHORIZED'
          ? 'NFC-e autorizada'
          : `NFC-e: ${INVOICE_STATUS_LABEL[inv.status] || inv.status}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao emitir NFC-e');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function cancelOrder(order: Order) {
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') return;
    const ok = await confirm({
      title: 'Cancelar pedido?',
      message: `O pedido #${order.orderNumber} será cancelado.`,
      confirmLabel: 'Cancelar pedido',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    setBusyId(order.id);
    setError('');
    setMessage('');
    try {
      await api(`/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: { status: 'CANCELLED' },
      });
      setMessage(`Pedido #${order.orderNumber} cancelado`);
      if (detail?.id === order.id) {
        setDetail({ ...detail, status: 'CANCELLED', paymentStatus: detail.paymentStatus });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar');
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(
    orderId: string,
    nextStatus: string,
    extra?: {
      trackingCode?: string;
      trackingUrl?: string;
      carrierShipmentId?: string;
    },
  ) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setBusyId(orderId);
    setError('');
    try {
      const updated = await api<Order>(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          status: nextStatus,
          ...(extra?.trackingCode !== undefined
            ? { trackingCode: extra.trackingCode || null }
            : {}),
          ...(extra?.trackingUrl !== undefined
            ? { trackingUrl: extra.trackingUrl || null }
            : {}),
          ...(extra?.carrierShipmentId !== undefined
            ? { carrierShipmentId: extra.carrierShipmentId || null }
            : {}),
        },
      });
      if (detail?.id === orderId) setDetail(updated);
      await load();
      setMessage(`Status atualizado: ${orderStatusLabel(nextStatus)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!printer.printerAutoPrint) return;
    const timer = setInterval(() => {
      load()
        .then((list) => {
          if (!list?.length) return;
          const printed = new Set(getPrintedIds());
          const newest = list.find(
            (o) => isOrderPaid(o) && !printed.has(o.id),
          );
          if (newest) {
            handlePrint(newest.id, true).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer.printerAutoPrint, load]);

  async function savePrinter() {
    const { token, storeSlug } = auth();
    setError('');
    setMessage('');
    if (printer.printerType === 'NETWORK' && !printer.printerHost?.trim()) {
      setError('Informe o IP da impressora térmica');
      return;
    }
    try {
      const updated = await api<PrinterConfig>('/stores/me/printer', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          printerType: printer.printerType,
          printerHost: printer.printerHost || null,
          printerPort: Number(printer.printerPort) || 9100,
          printerName: printer.printerName || null,
          printerAutoPrint: printer.printerAutoPrint,
          printerPaperWidth: Number(printer.printerPaperWidth) || 80,
          autoDeliverDays: 0,
        },
      });
      setPrinter({
        ...printer,
        ...updated,
        printerHost: updated.printerHost || '',
        printerName: updated.printerName || '',
        autoDeliverDays: 0,
      });
      setMessage(
        updated.printerType === 'NETWORK' && updated.printerAutoPrint
          ? 'Salvo · pedidos pagos saem sozinhos na térmica'
          : 'Impressora / automação salvos',
      );
      setPrinterOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar impressora');
    }
  }

  return (
    <div className="admin-page">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1>Pedidos</h1>
          <p className="text-sm text-muted">
            Ver pedido, seleção em massa, impressão e cancelamento
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={selected.size === 0 || bulkBusy}
            onClick={() => void bulkStatus('PROCESSING')}
          >
            Preparando ({selected.size})
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={selected.size === 0 || bulkBusy}
            onClick={() => void bulkStatus('SHIPPED')}
          >
            Enviado ({selected.size})
          </button>
          <button
            type="button"
            className="btn"
            disabled={selected.size === 0 || bulkBusy}
            onClick={() => void bulkStatus('DELIVERED')}
          >
            Entregue ({selected.size})
          </button>
          <button
            type="button"
            className="btn btn-accent"
            disabled={selected.size === 0 || bulkBusy}
            onClick={() => void printSelected()}
          >
            {bulkBusy
              ? 'Processando...'
              : `Imprimir (${selected.size})`}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPrinterOpen((v) => !v)}
          >
            {printerOpen ? 'Fechar config' : 'Impressora / automação'}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {printerOpen ? (
        <div className="card form-grid !p-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-sm font-bold">Impressora térmica</h2>
            <p className="mt-1 text-xs text-muted">
              Para imprimir vários pedidos e imprimir sozinho ao pagar: use{' '}
              <strong>Rede (IP)</strong>, coloque o IP da térmica (porta 9100) e
              ligue o automático. O servidor envia o cupom direto — sem abrir o
              navegador.
            </p>
          </div>
          <div>
            <label className="label">Conexão</label>
            <select
              className="field"
              value={printer.printerType}
              onChange={(e) =>
                setPrinter({
                  ...printer,
                  printerType: e.target.value as PrinterConfig['printerType'],
                })
              }
            >
              <option value="NETWORK">
                Rede / IP — imprime sozinho quando o pedido é pago
              </option>
              <option value="BROWSER">
                USB, cabo ou Bluetooth já pareado no computador
              </option>
            </select>
            <p className="mt-0.5 text-[11px] text-muted">
              {printer.printerType === 'NETWORK'
                ? 'A térmica precisa de IP fixo na mesma rede acessível pelo servidor.'
                : 'Abre a janela de impressão do navegador. Impressão automática só existe no modo Rede / IP.'}
            </p>
          </div>
          <div>
            <label className="label">Largura do papel</label>
            <select
              className="field"
              value={printer.printerPaperWidth}
              onChange={(e) =>
                setPrinter({ ...printer, printerPaperWidth: Number(e.target.value) })
              }
            >
              <option value={80}>80mm</option>
              <option value={58}>58mm</option>
            </select>
          </div>
          {printer.printerType === 'NETWORK' ? (
            <>
              <div>
                <label className="label">IP da impressora</label>
                <input
                  className="field"
                  placeholder="192.168.0.50"
                  value={printer.printerHost || ''}
                  onChange={(e) =>
                    setPrinter({ ...printer, printerHost: e.target.value })
                  }
                />
                <p className="mt-0.5 text-[11px] text-muted">
                  O servidor da loja precisa alcançar este IP (mesma rede / LAN)
                </p>
              </div>
              <div>
                <label className="label">Porta</label>
                <input
                  className="field"
                  type="number"
                  value={printer.printerPort || 9100}
                  onChange={(e) =>
                    setPrinter({
                      ...printer,
                      printerPort: Number(e.target.value),
                    })
                  }
                />
                <p className="mt-0.5 text-[11px] text-muted">
                  Quase sempre 9100 (ESC/POS)
                </p>
              </div>
            </>
          ) : (
            <div className="md:col-span-2">
              <label className="label">Nome da impressora (opcional)</label>
              <input
                className="field"
                placeholder="Ex: EPSON TM-T20"
                value={printer.printerName || ''}
                onChange={(e) =>
                  setPrinter({ ...printer, printerName: e.target.value })
                }
              />
              <p className="mt-0.5 text-[11px] text-muted">
                Neste modo cada impressão abre o diálogo do navegador — para
                fila automática use Rede (IP).
              </p>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={printer.printerAutoPrint}
              onChange={(e) =>
                setPrinter({ ...printer, printerAutoPrint: e.target.checked })
              }
            />
            <span>
              Imprimir automaticamente quando o pedido for{' '}
              <strong>pago</strong>
              {printer.printerType === 'NETWORK'
                ? ' (manda sozinho para a térmica, mesmo sem o painel aberto)'
                : ' (só enquanto o painel de pedidos estiver aberto)'}
            </span>
          </label>
          <div className="md:col-span-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-bold">Entrega = rastreio real (igual ML/Shopee)</p>
            <p className="mt-1">
              O status <strong>Entregue</strong> sobe quando a transportadora
              confirma (webhook Melhor Envio ou consulta do código), ou quando o
              cliente clica em <strong>Recebi o pedido</strong>. Não marca
              sozinho por dias.
            </p>
            <p className="mt-1 break-all text-[11px] text-amber-900/80">
              Webhook ME: /api/shipping/webhooks/melhor-envio
            </p>
          </div>
          <button
            type="button"
            className="btn btn-accent md:col-span-2"
            onClick={savePrinter}
          >
            Salvar impressora / automação
          </button>
        </div>
      ) : null}

      <div className="card flex flex-col gap-2 !p-2.5 md:flex-row md:flex-wrap md:items-center">
        <input
          className="field md:min-w-[200px] md:flex-1"
          placeholder="Buscar nº, nome ou e-mail"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field md:max-w-[200px]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {STATUS_FILTER.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel(s)}
            </option>
          ))}
        </select>
        <input
          className="field md:max-w-[150px]"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          className="field md:max-w-[150px]"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => {
            setPage(1);
            load(q, status, 1).catch((err) =>
              setError(err instanceof Error ? err.message : 'Erro'),
            );
          }}
        >
          Filtrar
        </button>
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-line bg-bg">
            <tr>
              <th className="px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-2.5 py-2">Pedido</th>
              <th className="px-2.5 py-2">Cliente</th>
              <th className="px-2.5 py-2">Status</th>
              <th className="px-2.5 py-2">Pagamento</th>
              <th className="px-2.5 py-2">Total</th>
              <th className="px-2.5 py-2">Data</th>
              <th className="px-2.5 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-2.5 py-3 text-muted" colSpan={8}>
                  Nenhum pedido
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b border-line hover:bg-[#f3f5f8] ${
                    selected.has(o.id) ? 'bg-[#f5f8ff]' : ''
                  }`}
                  onClick={() => void openDetail(o.id)}
                >
                  <td
                    className="px-2.5 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleOne(o.id)}
                      aria-label={`Selecionar pedido ${o.orderNumber}`}
                    />
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-medium">#{o.orderNumber}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    <div>{o.customerName}</div>
                    <div className="text-xs text-muted">{o.customerEmail}</div>
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={o.paymentStatus} kind="payment" />
                  </td>
                  <td className="px-2.5 py-2 font-semibold">{money(o.total)}</td>
                  <td className="px-2.5 py-2 text-xs">
                    {new Date(o.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td
                    className="px-2.5 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost py-1 text-xs"
                        onClick={() => void openDetail(o.id)}
                      >
                        Ver pedido
                      </button>
                      {isOrderPaid(o) ? (
                        <button
                          type="button"
                          className="btn btn-ghost py-1 text-xs"
                          disabled={busyId === o.id}
                          onClick={() => void handlePrint(o.id)}
                        >
                          {busyId === o.id ? '...' : 'Imprimir'}
                        </button>
                      ) : null}
                      {o.status !== 'CANCELLED' && o.status !== 'REFUNDED' ? (
                        <button
                          type="button"
                          className="btn btn-danger py-1 text-xs"
                          disabled={busyId === o.id}
                          onClick={() => void cancelOrder(o)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        className="mt-3"
        page={page}
        totalPages={totalPages}
        total={total}
        label="pedidos"
        onPageChange={(next) => {
          setPage(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {detail || detailLoading ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onClick={() => {
            if (!detailLoading) {
              setDetail(null);
              setInvoice(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <p className="text-sm text-muted">Carregando detalhes...</p>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">Pedido #{detail.orderNumber}</h2>
                    <p className="text-xs text-muted">
                      {new Date(detail.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => setDetail(null)}
                  >
                    Fechar
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <StatusBadge status={detail.status} />
                  <StatusBadge status={detail.paymentStatus} kind="payment" />
                </div>

                <div className="mb-3 space-y-1 text-sm">
                  <p>
                    <span className="text-muted">Cliente:</span> {detail.customerName}
                  </p>
                  <p>
                    <span className="text-muted">E-mail:</span> {detail.customerEmail}
                  </p>
                  {detail.customerPhone ? (
                    <p>
                      <span className="text-muted">Telefone:</span> {detail.customerPhone}
                    </p>
                  ) : null}
                  {formatAddress(detail.shippingAddress) ? (
                    <p>
                      <span className="text-muted">Endereço:</span>{' '}
                      {formatAddress(detail.shippingAddress)}
                    </p>
                  ) : null}
                  {detail.shippingMethod ? (
                    <p>
                      <span className="text-muted">Frete:</span> {detail.shippingMethod}
                    </p>
                  ) : null}
                  {detail.trackingCode ? (
                    <p>
                      <span className="text-muted">Rastreio:</span> {detail.trackingCode}
                    </p>
                  ) : null}
                </div>

                {detail.paymentStatus === 'APPROVED' ? (
                  <div className="mb-3 border-t border-line pt-3">
                    {detail.labelUrl ? (
                      <a
                        href={detail.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost w-full"
                      >
                        Abrir etiqueta (PDF)
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost w-full"
                        disabled={labelBusy}
                        onClick={async () => {
                          setLabelBusy(true);
                          setError('');
                          try {
                            const { token, storeSlug } = auth();
                            const res = await api<{
                              labelUrl?: string | null;
                              trackingCode?: string | null;
                            }>(`/admin/orders/${detail.id}/label`, {
                              method: 'POST',
                              token,
                              storeSlug,
                            });
                            setDetail({
                              ...detail,
                              labelUrl: res.labelUrl ?? null,
                              trackingCode:
                                res.trackingCode ?? detail.trackingCode ?? null,
                            });
                            await load();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Falha ao gerar etiqueta',
                            );
                          } finally {
                            setLabelBusy(false);
                          }
                        }}
                      >
                        {labelBusy ? 'Gerando etiqueta...' : 'Gerar etiqueta'}
                      </button>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      Compra a etiqueta no Melhor Envio com o saldo da sua
                      conta e traz o código de rastreio.
                    </p>
                  </div>
                ) : null}

                <ul className="mb-3 space-y-2 border-t border-line pt-3">
                  {(detail.items || []).map((item) => {
                    const img = mediaUrl(item.product?.images?.[0]?.url);
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden border border-line bg-[#eee]">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] text-muted">
                              —
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">
                            {item.quantity}× {item.productName}
                          </p>
                          {item.sku ? (
                            <p className="mt-0.5 text-xs font-semibold text-ink">
                              Cód: {item.sku}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-muted">
                              Sem código de barras
                            </p>
                          )}
                        </div>
                        <strong className="shrink-0">{money(item.total)}</strong>
                      </li>
                    );
                  })}
                </ul>

                <div className="mb-4 space-y-1 border-t border-line pt-3 text-sm">
                  {detail.subtotal != null ? (
                    <div className="flex justify-between">
                      <span className="text-muted">Subtotal</span>
                      <span>{money(detail.subtotal)}</span>
                    </div>
                  ) : null}
                  {Number(detail.discount) > 0 ? (
                    <div className="flex justify-between text-[var(--ok)]">
                      <span>Desconto</span>
                      <span>−{money(detail.discount!)}</span>
                    </div>
                  ) : null}
                  {detail.shippingCost != null ? (
                    <div className="flex justify-between">
                      <span className="text-muted">Frete</span>
                      <span>
                        {Number(detail.shippingCost) === 0
                          ? 'Grátis'
                          : money(detail.shippingCost)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>{money(detail.total)}</span>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="label">Alterar status</label>
                  <select
                    className="field"
                    value={detail.status}
                    disabled={busyId === detail.id}
                    onChange={(e) => void updateStatus(detail.id, e.target.value)}
                  >
                    {STATUS_FILTER.filter((s) => {
                      const paid =
                        detail.paymentStatus === 'APPROVED' ||
                        detail.status === 'PAID' ||
                        detail.status === 'PROCESSING' ||
                        detail.status === 'SHIPPED' ||
                        detail.status === 'DELIVERED';
                      if (s === 'PENDING' && paid) return false;
                      return true;
                    }).map((s) => (
                      <option key={s} value={s}>
                        {orderStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-[11px] font-bold uppercase text-muted">
                      Rastreio (cliente vê na conta)
                    </p>
                  </div>
                  <div>
                    <label className="label">Código de rastreio</label>
                    <input
                      className="field"
                      defaultValue={detail.trackingCode || ''}
                      key={`tc-${detail.id}-${detail.trackingCode || ''}`}
                      id="admin-tracking-code"
                      placeholder="BR123456789BR"
                    />
                  </div>
                  <div>
                    <label className="label">Link de rastreio (opcional)</label>
                    <input
                      className="field"
                      defaultValue={detail.trackingUrl || ''}
                      key={`tu-${detail.id}-${detail.trackingUrl || ''}`}
                      id="admin-tracking-url"
                      placeholder="https://… (Melhor Envio, etc.)"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">
                      ID etiqueta Melhor Envio (opcional)
                    </label>
                    <input
                      className="field"
                      defaultValue={detail.carrierShipmentId || ''}
                      key={`me-${detail.id}-${detail.carrierShipmentId || ''}`}
                      id="admin-carrier-shipment-id"
                      placeholder="UUID da etiqueta no Melhor Envio"
                    />
                    <p className="mt-0.5 text-[11px] text-muted">
                      Com esse ID o sistema recebe postagem/entrega via webhook
                      e atualiza o status sozinho (como ML/Shopee).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost sm:col-span-2"
                    disabled={busyId === detail.id}
                    onClick={() => {
                      const code = (
                        document.getElementById(
                          'admin-tracking-code',
                        ) as HTMLInputElement | null
                      )?.value;
                      const url = (
                        document.getElementById(
                          'admin-tracking-url',
                        ) as HTMLInputElement | null
                      )?.value;
                      const meId = (
                        document.getElementById(
                          'admin-carrier-shipment-id',
                        ) as HTMLInputElement | null
                      )?.value;
                      void updateStatus(
                        detail.id,
                        detail.status === 'PENDING' ||
                          detail.status === 'PAID' ||
                          detail.status === 'PROCESSING'
                          ? 'SHIPPED'
                          : detail.status,
                        {
                          trackingCode: code || '',
                          trackingUrl: url || '',
                          carrierShipmentId: meId || '',
                        },
                      );
                    }}
                  >
                    Salvar rastreio
                    {detail.status === 'PENDING' ||
                    detail.status === 'PAID' ||
                    detail.status === 'PROCESSING'
                      ? ' e marcar como enviado'
                      : ''}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isOrderPaid(detail) ? (
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={busyId === detail.id}
                      onClick={() => void handlePrint(detail.id)}
                    >
                      Imprimir
                    </button>
                  ) : null}
                  {isOrderPaid(detail) ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={
                        invoiceBusy ||
                        invoice?.status === 'AUTHORIZED' ||
                        invoice?.status === 'PENDING'
                      }
                      onClick={() => void issueInvoice(detail.id)}
                    >
                      {invoiceBusy
                        ? 'Emitindo...'
                        : invoice?.status === 'AUTHORIZED'
                          ? 'NFC-e autorizada'
                          : invoice?.status === 'PENDING'
                            ? 'NFC-e processando'
                            : invoice
                              ? 'Reemitir NFC-e'
                              : 'Emitir NFC-e'}
                    </button>
                  ) : null}
                  {detail.status !== 'CANCELLED' && detail.status !== 'REFUNDED' ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busyId === detail.id}
                      onClick={() => void cancelOrder(detail)}
                    >
                      Cancelar pedido
                    </button>
                  ) : null}
                </div>
                {invoice ? (
                  <div className="mt-3 border border-line bg-[#fafafa] p-3 text-xs">
                    <p className="font-semibold">
                      NFC-e · {INVOICE_STATUS_LABEL[invoice.status] || invoice.status}
                    </p>
                    {invoice.number != null ? (
                      <p className="mt-1 text-muted">
                        Nº {invoice.number}
                        {invoice.series ? ` · série ${invoice.series}` : ''}
                      </p>
                    ) : null}
                    {invoice.errorMessage ? (
                      <p className="mt-1 text-accent">{invoice.errorMessage}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {invoice.pdfUrl ? (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          PDF
                        </a>
                      ) : null}
                      {invoice.xmlUrl ? (
                        <a
                          href={invoice.xmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          XML
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}
