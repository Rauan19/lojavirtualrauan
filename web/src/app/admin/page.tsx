'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { orderStatusLabel } from '@/lib/order-status';

type Period = 'day' | 'week' | 'month' | 'year';

type Summary = {
  period: Period;
  date?: string | null;
  from?: string;
  to?: string;
  ordersCount: number;
  paidOrders: number;
  revenue: number;
  ticketMedio: number;
  byStatus: { status: string; count: number }[];
  topProducts: { productName: string; quantity: number; total: number }[];
  series: { label: string; orders: number; revenue: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: string;
    customerName: string;
    createdAt: string;
  }[];
};

const periods: { id: Period; label: string }[] = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

const statusOptions = [
  '',
  'PENDING',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(from?: string, to?: string, date?: string | null) {
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
    }
  }
  if (!from || !to) return null;
  const a = new Date(from).toLocaleDateString('pt-BR');
  const b = new Date(to).toLocaleDateString('pt-BR');
  return a === b ? a : `${a} — ${b}`;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [specificDate, setSpecificDate] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const usingSpecificDate = Boolean(specificDate);

  const load = useCallback(async () => {
    const user = getUser();
    const token = getToken();
    if (!user || !token) {
      setError('Sessão expirada. Faça login de novo.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (specificDate) {
        params.set('date', specificDate);
        params.set('period', 'day');
      } else {
        params.set('period', period);
      }
      if (status) params.set('status', status);
      const summary = await api<Summary>(`/admin/dashboard/summary?${params}`, {
        token,
        storeSlug: user.store?.slug,
      });
      setData({
        ...summary,
        byStatus: summary.byStatus ?? [],
        topProducts: summary.topProducts ?? [],
        series: summary.series ?? [],
        recentOrders: summary.recentOrders ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [period, specificDate, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = data?.series ?? [];
  const byStatus = data?.byStatus ?? [];
  const maxRevenue = Math.max(...series.map((s) => s.revenue), 1);
  const maxOrders = Math.max(...series.map((s) => s.orders), 1);
  const maxStatus = Math.max(...byStatus.map((s) => s.count), 1);

  const rangeLabel = useMemo(
    () => formatRangeLabel(data?.from, data?.to, data?.date || specificDate || null),
    [data?.from, data?.to, data?.date, specificDate],
  );

  function selectPeriod(id: Period) {
    setSpecificDate('');
    setPeriod(id);
  }

  return (
    <div className="admin-page">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1>Dashboard</h1>
          <p className="text-sm text-muted">
            Faturamento e pedidos
            {rangeLabel ? (
              <>
                {' '}
                · <span className="font-medium text-ink">{rangeLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn py-1.5 ${
                !usingSpecificDate && period === p.id ? 'btn-accent' : 'btn-ghost'
              }`}
              onClick={() => selectPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="whitespace-nowrap font-semibold uppercase tracking-wide">
              Dia
            </span>
            <input
              type="date"
              className={`field w-auto min-w-[150px] py-1.5 ${
                usingSpecificDate ? 'ring-1 ring-ink' : ''
              }`}
              value={specificDate}
              max={todayInputValue()}
              onChange={(e) => setSpecificDate(e.target.value)}
              aria-label="Dia específico"
            />
          </label>
          {usingSpecificDate ? (
            <button
              type="button"
              className="btn btn-ghost py-1.5 text-xs"
              onClick={() => setSpecificDate('')}
            >
              Limpar data
            </button>
          ) : null}
          <select
            className="field w-auto min-w-[140px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {statusOptions.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="card !p-3">
          <p className="text-sm text-accent">{error}</p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-muted">Carregando...</p>
      ) : data ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Pedidos', String(data.ordersCount)],
              ['Pagos', String(data.paidOrders)],
              ['Faturamento', money(data.revenue)],
              ['Ticket médio', money(data.ticketMedio)],
            ].map(([label, value]) => (
              <article key={label} className="card !p-3">
                <p className="label !mb-0">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </article>
            ))}
          </div>

          {data.ordersCount === 0 ? (
            <p className="rounded border border-line bg-white px-3 py-2 text-sm text-muted">
              Nenhum pedido neste período. Troque o filtro acima ou confira em{' '}
              <Link href="/admin/orders" className="font-medium text-ink underline">
                Pedidos
              </Link>
              .
            </p>
          ) : null}

          <section className="card !p-3">
            <h2 className="mb-2 text-sm font-bold">Faturamento no período</h2>
            <div className="flex h-40 items-end gap-1 border-b border-line pb-1">
              {series.length === 0 ? (
                <p className="text-sm text-muted">Sem dados</p>
              ) : (
                series.map((point, i) => (
                  <div
                    key={`${point.label}-${i}`}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full max-w-[28px] rounded-t bg-accent"
                      style={{
                        height: `${Math.max(3, (point.revenue / maxRevenue) * 140)}px`,
                      }}
                      title={`${point.label}: ${money(point.revenue)} · ${point.orders} pedidos`}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="mt-1 flex gap-1 overflow-hidden text-[10px] text-muted">
              {series.map((point, i) => (
                <span
                  key={`l-${point.label}-${i}`}
                  className="min-w-0 flex-1 truncate text-center"
                >
                  {point.label}
                </span>
              ))}
            </div>
          </section>

          <div className="grid gap-2 lg:grid-cols-2">
            <section className="card !p-3">
              <h2 className="mb-2 text-sm font-bold">
                {usingSpecificDate || period === 'day'
                  ? 'Pedidos por hora'
                  : 'Pedidos por dia'}
              </h2>
              <div className="space-y-1.5">
                {series.slice(-8).map((point, i) => (
                  <div
                    key={`o-${point.label}-${i}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-12 shrink-0 text-muted">{point.label}</span>
                    <div className="h-2 flex-1 bg-[#eef0f3]">
                      <div
                        className="h-2 bg-ink"
                        style={{ width: `${(point.orders / maxOrders) * 100}%` }}
                      />
                    </div>
                    <strong className="w-6 text-right">{point.orders}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="card !p-3">
              <h2 className="mb-2 text-sm font-bold">Por status</h2>
              <ul className="space-y-1.5">
                {byStatus.length === 0 ? (
                  <li className="text-sm text-muted">Sem pedidos</li>
                ) : (
                  byStatus.map((s) => (
                    <li key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate">
                        {orderStatusLabel(s.status)}
                      </span>
                      <div className="h-2 flex-1 bg-[#eef0f3]">
                        <div
                          className="h-2 bg-accent"
                          style={{ width: `${(s.count / maxStatus) * 100}%` }}
                        />
                      </div>
                      <strong className="w-6 text-right">{s.count}</strong>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <section className="card !p-3">
              <h2 className="mb-2 text-sm font-bold">Mais vendidos</h2>
              <ul className="divide-y divide-line">
                {data.topProducts.length === 0 ? (
                  <li className="py-2 text-sm text-muted">Sem vendas pagas</li>
                ) : (
                  data.topProducts.slice(0, 6).map((p) => (
                    <li
                      key={p.productName}
                      className="flex justify-between gap-2 py-1.5 text-sm"
                    >
                      <span className="truncate">
                        {p.productName} · {p.quantity} un.
                      </span>
                      <strong className="shrink-0">{money(p.total)}</strong>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="card !p-3">
              <h2 className="mb-2 text-sm font-bold">Pedidos recentes</h2>
              <ul className="divide-y divide-line">
                {data.recentOrders.length === 0 ? (
                  <li className="py-2 text-sm text-muted">Nenhum pedido</li>
                ) : (
                  data.recentOrders.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between gap-2 py-1.5 text-sm"
                    >
                      <span className="truncate">
                        #{o.orderNumber} · {o.customerName}
                      </span>
                      <strong className="shrink-0">{money(o.total)}</strong>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
