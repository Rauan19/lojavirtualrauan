'use client';

import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { StatusBadge } from '@/lib/order-status';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  hasAccount: boolean;
  orders: number;
  totalSpent: number;
  lastOrderAt?: string | null;
};

type Address = {
  id: string;
  label?: string | null;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
};

type CustomerOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  createdAt: string;
};

type CustomerDetail = Omit<Customer, 'orders' | 'lastOrderAt'> & {
  cpf?: string | null;
  paidOrders: number;
  addresses: Address[];
  orders: CustomerOrder[];
};

type ListResponse = {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function AdminCustomersPage() {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<Customer[]>([]);
  // usado para recarregar a lista depois de anonimizar um cliente
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  useEffect(() => {
    const { token, storeSlug } = auth();
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedQ) params.set('q', debouncedQ);
    if (sort !== 'recent') params.set('sort', sort);

    api<ListResponse>(`/admin/customers?${params}`, { token, storeSlug })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages || 1);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [page, debouncedQ, sort, reloadKey]);

  const [lgpdBusy, setLgpdBusy] = useState(false);

  /** Gera o JSON e entrega como download — é a portabilidade do art. 18, V. */
  async function baixarDados(cliente: { id: string; name: string }) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setLgpdBusy(true);
    setError('');
    try {
      const dados = await api<Record<string, unknown>>(
        `/admin/customers/${cliente.id}/dados-pessoais`,
        { token, storeSlug },
      );
      const blob = new Blob([JSON.stringify(dados, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dados-${cliente.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setLgpdBusy(false);
    }
  }

  async function anonimizar(cliente: { id: string; name: string }) {
    const ok = await confirm({
      title: 'Excluir os dados deste cliente?',
      message:
        `Nome, e-mail, telefone, CPF e endereços de ${cliente.name} são removidos e o acesso dele é derrubado. ` +
        'Os pedidos continuam no histórico sem identificação, porque a nota fiscal e a contabilidade exigem. Não tem desfazer.',
      confirmLabel: 'Excluir dados',
      danger: true,
    });
    if (!ok) return;
    const { token, storeSlug } = auth();
    if (!token) return;
    setLgpdBusy(true);
    setError('');
    try {
      await api(`/admin/customers/${cliente.id}/anonimizar`, {
        method: 'POST',
        token,
        storeSlug,
      });
      setDetail(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setLgpdBusy(false);
    }
  }

  useEffect(() => {
    document.body.style.overflow = detail ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [detail]);

  async function openDetail(id: string) {
    const { token, storeSlug } = auth();
    if (!token) return;
    setDetailLoading(true);
    try {
      const data = await api<CustomerDetail>(`/admin/customers/${id}`, {
        token,
        storeSlug,
      });
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir cliente');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="admin-page">
      <div>
        <h1>Clientes</h1>
        <p className="text-sm text-muted">
          Quem já comprou na sua loja
          {total > 0 ? ` · ${total} cadastrado${total === 1 ? '' : 's'}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="field max-w-xs"
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Ordenar por"
        >
          <option value="recent">Mais recentes</option>
          <option value="spent">Quem mais gastou</option>
          <option value="orders">Quem mais comprou</option>
          <option value="name">Nome A-Z</option>
        </select>
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm font-medium">
            {debouncedQ ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {debouncedQ
              ? 'Tente outro nome, e-mail ou telefone.'
              : 'Assim que alguém comprar, aparece aqui.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-[#fafafa] text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Contato</th>
                <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-3 py-2 text-right font-semibold">Total gasto</th>
                <th className="px-3 py-2 font-semibold">Última compra</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((c) => (
                <tr key={c.id} className="align-middle">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted">
                      Desde {formatDate(c.createdAt)}
                      {c.hasAccount ? '' : ' · sem conta'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="truncate text-xs">{c.email}</p>
                    {c.phone ? (
                      <p className="text-[11px] text-muted">{c.phone}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.orders}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {money(c.totalSpent)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {formatDate(c.lastOrderAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      className="btn btn-ghost px-2.5 py-1.5 text-xs"
                      onClick={() => openDetail(c.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        label="clientes"
        onPageChange={(next) => {
          setPage(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {detailLoading ? (
        <p className="text-sm text-muted">Abrindo cliente...</p>
      ) : null}

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold">{detail.name}</h2>
                <p className="truncate text-xs text-muted">
                  {detail.email}
                  {detail.phone ? ` · ${detail.phone}` : ''}
                  {detail.cpf ? ` · CPF ${detail.cpf}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn shrink-0"
                aria-label="Fechar"
                onClick={() => setDetail(null)}
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-line px-3 py-2">
                  <p className="label">Pedidos pagos</p>
                  <p className="text-lg font-bold tabular-nums">{detail.paidOrders}</p>
                </div>
                <div className="border border-line px-3 py-2">
                  <p className="label">Total gasto</p>
                  <p className="text-lg font-bold tabular-nums">
                    {money(detail.totalSpent)}
                  </p>
                </div>
                <div className="border border-line px-3 py-2">
                  <p className="label">Cliente desde</p>
                  <p className="text-lg font-bold">{formatDate(detail.createdAt)}</p>
                </div>
              </div>

              {detail.addresses.length > 0 ? (
                <section className="mt-4">
                  <h3 className="text-sm font-bold">Endereços</h3>
                  <ul className="mt-2 space-y-1.5">
                    {detail.addresses.map((a) => (
                      <li key={a.id} className="border border-line px-3 py-2 text-sm">
                        {a.isDefault ? (
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-[var(--ok)]">
                            Padrão
                          </span>
                        ) : null}
                        {a.street}, {a.number}
                        {a.complement ? ` — ${a.complement}` : ''}
                        <span className="block text-xs text-muted">
                          {a.neighborhood} · {a.city}/{a.state} · CEP {a.zipCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="mt-4">
                <h3 className="text-sm font-bold">
                  Histórico de pedidos ({detail.orders.length})
                </h3>
                {detail.orders.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Nenhum pedido ainda.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line border border-line">
                    {detail.orders.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">#{o.orderNumber}</p>
                          <p className="text-[11px] text-muted">
                            {new Date(o.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <StatusBadge status={o.status} />
                        <strong className="tabular-nums">{money(o.total)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/*
                LGPD art. 18: o titular pode pedir acesso, portabilidade e
                exclusão — e o lojista precisa de um caminho para atender.
              */}
              <section className="border-t border-line pt-4">
                <p className="text-[13px] font-semibold">
                  Dados pessoais (LGPD)
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  Use quando o cliente pedir acesso aos dados ou exclusão da
                  conta.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs"
                    disabled={lgpdBusy}
                    onClick={() => void baixarDados(detail)}
                  >
                    Baixar dados do cliente
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost py-1.5 text-xs text-accent"
                    disabled={lgpdBusy || detail.email.endsWith('@removido.local')}
                    onClick={() => void anonimizar(detail)}
                  >
                    {detail.email.endsWith('@removido.local')
                      ? 'Dados já removidos'
                      : 'Excluir dados pessoais'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  A exclusão remove nome, e-mail, telefone, CPF e endereços, e
                  derruba o acesso do cliente. Os pedidos continuam guardados
                  sem identificação, porque a nota fiscal já emitida e a
                  contabilidade exigem isso por lei.
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
