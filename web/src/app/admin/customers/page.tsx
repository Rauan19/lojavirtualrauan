'use client';

import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { StatusBadge } from '@/lib/order-status';
import { CabecalhoPagina, EstadoVazio, Secao, Selo } from '@/components/admin/Pagina';

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
      <CabecalhoPagina
        icone="/admin/customers"
        titulo="Clientes"
        descricao={
          <>
            Quem já comprou na sua loja
            {total > 0 ? ` · ${total} cadastrado${total === 1 ? '' : 's'}` : ''}
          </>
        }
      />

      {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}

      <Secao
        semRespiro
        titulo="Todos os clientes"
        acoes={
          <>
            <label className="relative">
              <span className="sr-only">Buscar cliente</span>
              <input
                className="field h-10 w-[240px] !rounded-full pl-9"
                placeholder="Nome, e-mail ou telefone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              >
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </label>
            <select
              className="field h-10 w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Ordenar por"
            >
              <option value="recent">Mais recentes</option>
              <option value="spent">Quem mais gastou</option>
              <option value="orders">Quem mais comprou</option>
              <option value="name">Nome A-Z</option>
            </select>
          </>
        }
      >
      {loading ? (
        <p className="px-5 py-10 text-center text-sm text-muted">Carregando…</p>
      ) : items.length === 0 ? (
        <EstadoVazio
          icone="/admin/customers"
          titulo={debouncedQ ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
          texto={
            debouncedQ
              ? 'Tente outro nome, e-mail ou telefone.'
              : 'Assim que alguém comprar na sua loja, aparece aqui com o histórico de pedidos.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="px-5 py-2">Cliente</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Total gasto</th>
                <th className="px-3 py-2">Última compra</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((c) => (
                <tr key={c.id} className="align-middle">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9f1f3] text-[13px] font-bold text-[var(--brand-deep)]"
                        aria-hidden
                      >
                        {(c.name || '·').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{c.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                          Desde {formatDate(c.createdAt)}
                          {c.hasAccount ? null : <Selo>sem conta</Selo>}
                        </span>
                      </span>
                    </div>
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
                  <td className="px-5 py-2.5 text-right">
                    <button
                      type="button"
                      className="btn btn-ghost h-9 px-3 text-[13px]"
                      onClick={() => openDetail(c.id)}
                    >
                      Ver cliente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </Secao>

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
        <p className="text-sm text-muted">Abrindo cliente…</p>
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
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{detail.name}</h2>
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-[#f6f8fa] px-3.5 py-3">
                  <p className="label">Pedidos pagos</p>
                  <p className="text-lg font-bold tabular-nums">{detail.paidOrders}</p>
                </div>
                <div className="rounded-xl bg-[#f6f8fa] px-3.5 py-3">
                  <p className="label">Total gasto</p>
                  <p className="text-lg font-bold tabular-nums">
                    {money(detail.totalSpent)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f6f8fa] px-3.5 py-3">
                  <p className="label">Cliente desde</p>
                  <p className="text-lg font-bold">{formatDate(detail.createdAt)}</p>
                </div>
              </div>

              {detail.addresses.length > 0 ? (
                <section className="mt-4">
                  <h3 className="text-sm font-bold">Endereços</h3>
                  <ul className="mt-2 space-y-1.5">
                    {detail.addresses.map((a) => (
                      <li key={a.id} className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
                        {a.isDefault ? (
                          <span className="mb-0.5 block text-[11px] font-bold uppercase text-[var(--ok)]">
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
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
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
