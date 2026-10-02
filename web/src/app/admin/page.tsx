'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PrimeirosPassos } from '@/components/PrimeirosPassos';
import dynamic from 'next/dynamic';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { orderStatusLabel } from '@/lib/order-status';
import { CabecalhoPagina } from '@/components/admin/Pagina';

// Gráficos (recharts) só baixam quando o dono abre o painel: a equipe e o
// primeiro carregamento não pagam por eles
const carregandoGrafico = () => (
  <div className="h-48 animate-pulse bg-[#f3f4f6]" aria-hidden />
);
const RevenueAreaChart = dynamic(
  () => import('@/components/admin/DashboardCharts').then((m) => m.RevenueAreaChart),
  { ssr: false, loading: carregandoGrafico },
);
const OrdersBarChart = dynamic(
  () => import('@/components/admin/DashboardCharts').then((m) => m.OrdersBarChart),
  { ssr: false, loading: carregandoGrafico },
);
const StatusBarChart = dynamic(
  () => import('@/components/admin/DashboardCharts').then((m) => m.StatusBarChart),
  { ssr: false, loading: carregandoGrafico },
);

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

function PainelDoDono() {
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
      <PrimeirosPassos />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <CabecalhoPagina
          icone="/admin"
          titulo="Painel"
          descricao={
            <>
              Faturamento e pedidos
              {rangeLabel ? (
                <>
                  {' '}
                  · <span className="font-medium text-ink">{rangeLabel}</span>
                </>
              ) : null}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-xl border border-line bg-white p-1" role="group" aria-label="Período">
            {periods.map((p) => {
              const ativo = !usingSpecificDate && period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={ativo}
                  className={`h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                    ativo
                      ? 'bg-[var(--brand-deep)] text-white'
                      : 'text-muted hover:bg-[#f3f5f7] hover:text-ink'
                  }`}
                  onClick={() => selectPeriod(p.id)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
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
        <p className="text-muted">Carregando…</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ['Faturamento', money(data.revenue), 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3', true],
                ['Pedidos', String(data.ordersCount), 'M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17ZM9 8h6M9 12h6', false],
                ['Pagos', String(data.paidOrders), 'M20 6 9 17l-5-5', false],
                ['Ticket médio', money(data.ticketMedio), 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6', false],
              ] as const
            ).map(([label, value, icone, destaque]) => (
              <article
                key={label}
                className={`card flex items-center gap-3.5 ${destaque ? '!bg-[var(--brand-deep)] !text-white' : ''}`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    destaque ? 'bg-white/15' : 'bg-[#e9f1f3] text-[var(--brand-deep)]'
                  }`}
                  aria-hidden
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={icone} />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] ${destaque ? 'text-white/75' : 'text-muted'}`}>
                    {label}
                  </span>
                  <span className="block truncate text-[24px] font-bold leading-tight tabular-nums">
                    {value}
                  </span>
                </span>
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

          <section className="card min-w-0 !p-3">
            <h2 className="mb-1 text-sm font-bold">Faturamento no período</h2>
            <RevenueAreaChart data={series} />
          </section>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <section className="card min-w-0 !p-3">
              <h2 className="mb-1 text-sm font-bold">
                {usingSpecificDate || period === 'day'
                  ? 'Pedidos por hora'
                  : 'Pedidos por dia'}
              </h2>
              <OrdersBarChart data={series} />
            </section>

            <section className="card min-w-0 !p-3">
              <h2 className="mb-1 text-sm font-bold">Por status</h2>
              <StatusBarChart data={byStatus} />
            </section>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <section className="card min-w-0 !p-3">
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

            <section className="card min-w-0 !p-3">
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

/** Atalhos de cada área que o dono pode liberar para a equipe. */
const ATALHOS: Record<string, { titulo: string; links: [string, string][] }> = {
  pedidos: {
    titulo: 'Pedidos',
    links: [
      ['/admin/orders', 'Ver pedidos'],
      ['/admin/refunds', 'Reembolsos'],
    ],
  },
  produtos: {
    titulo: 'Produtos',
    links: [
      ['/admin/products', 'Ver produtos'],
      ['/admin/categories', 'Categorias'],
      ['/admin/promotions', 'Promoções'],
      ['/admin/reviews', 'Avaliações'],
    ],
  },
  clientes: { titulo: 'Clientes', links: [['/admin/customers', 'Ver clientes']] },
  marketing: {
    titulo: 'Marketing',
    links: [
      ['/admin/coupons', 'Cupons'],
      ['/admin/carrinhos-abandonados', 'Carrinhos abandonados'],
      ['/admin/catalogo', 'Google e Instagram'],
      ['/admin/avise-me', 'Avise-me'],
    ],
  },
  configuracoes: {
    titulo: 'Loja',
    links: [['/admin/settings', 'Aparência e frete']],
  },
};

/**
 * Início do painel para quem é da equipe: faturamento e números de venda
 * ficam só com o dono; aqui vão os atalhos das áreas liberadas.
 */
function PainelDaEquipe({
  nome,
  permissoes,
}: {
  nome: string;
  permissoes: string[];
}) {
  const areas = permissoes.filter((p) => ATALHOS[p]);
  return (
    <div className="admin-page max-w-3xl space-y-5">
      <div>
        <h1>Olá, {nome.split(/\s+/)[0]}!</h1>
        <p className="mt-1 text-sm text-muted">
          Estas são as partes do painel que você cuida.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((a) => (
          <section key={a} className="border border-line bg-white px-4 py-3">
            <h2 className="text-sm font-bold">{ATALHOS[a].titulo}</h2>
            <ul className="mt-2 space-y-1">
              {ATALHOS[a].links.map(([href, rotulo]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted">
        Precisa de outra área? Peça para o dono da loja liberar em Equipe.
      </p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [equipe, setEquipe] = useState<{
    nome: string;
    permissoes: string[];
  } | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (u && u.dono === false) {
      setEquipe({ nome: u.name, permissoes: u.permissoes ?? [] });
    }
    setPronto(true);
  }, []);

  if (!pronto) return null;
  return equipe ? <PainelDaEquipe {...equipe} /> : <PainelDoDono />;
}
