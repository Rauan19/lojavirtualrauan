'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  BillingSummary,
  feeNumber,
  formatDate,
  moneyBr,
  planBadge,
  PlatformMpSettings,
  statusLabel,
  StoreRow,
} from './_lib';

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function moneyCompact(value: number) {
  if (value >= 1000) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
  }
  return moneyBr(value);
}

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'bg-[#e8f6ee] text-[#1b8f4a]';
  if (status === 'TRIAL') return 'bg-[#eef2ff] text-[#3b4cca]';
  if (status === 'PAST_DUE') return 'bg-[#fff4e5] text-[#b54708]';
  if (status === 'SUSPENDED') return 'bg-[#fde8e8] text-[#b42318]';
  return 'bg-[#f0f1f3] text-[#5c6570]';
}

export default function SuperDashboardPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [mp, setMp] = useState<PlatformMpSettings | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (soft = false) => {
    const token = getToken();
    if (!token) return;
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [list, bill, platformMp] = await Promise.all([
        api<StoreRow[]>('/stores', { token }),
        api<BillingSummary>('/stores/billing', { token }),
        api<PlatformMpSettings>('/billing/platform/mercadopago', {
          token,
        }).catch(() => null),
      ]);
      setStores(list);
      setBilling(bill);
      setMp(platformMp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const expired = stores.filter((s) => s.planState === 'expired');
    const expiring = stores.filter((s) => s.planState === 'expiring');
    const pastDue = stores.filter((s) => s.status === 'PAST_DUE');
    const trial = stores.filter((s) => s.status === 'TRIAL');
    const active = stores.filter((s) => s.status === 'ACTIVE');
    const suspended = stores.filter((s) => s.status === 'SUSPENDED');
    const products = stores.reduce((n, s) => n + (s._count?.products || 0), 0);
    const orders = stores.reduce((n, s) => n + (s._count?.orders || 0), 0);
    const customers = stores.reduce(
      (n, s) => n + (s._count?.customers || 0),
      0,
    );
    const mrr = billing?.mrr ?? 0;
    const potential = billing?.potentialMrr ?? 0;
    const overdue = billing?.overdueAmount ?? 0;
    const paying = billing?.payingCount ?? active.length + trial.length;
    const capture = pct(mrr, potential || 1);
    const avgTicket =
      paying > 0 ? mrr / Math.max(1, active.length + trial.length) : 0;

    const attention = [...stores]
      .filter(
        (s) =>
          s.planState === 'expired' ||
          s.planState === 'expiring' ||
          s.status === 'PAST_DUE' ||
          s.status === 'SUSPENDED',
      )
      .sort((a, b) => {
        const rank = (s: StoreRow) => {
          if (s.planState === 'expired' || s.status === 'SUSPENDED') return 0;
          if (s.status === 'PAST_DUE') return 1;
          if (s.planState === 'expiring') return 2;
          return 3;
        };
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
      });

    const topByOrders = [...stores]
      .sort((a, b) => (b._count?.orders || 0) - (a._count?.orders || 0))
      .slice(0, 5);

    const newest = [...stores].slice(0, 5);

    return {
      total: stores.length,
      expired,
      expiring,
      pastDue,
      trial,
      active,
      suspended,
      products,
      orders,
      customers,
      mrr,
      potential,
      overdue,
      trialAmount: billing?.trialAmount ?? 0,
      paying,
      capture,
      avgTicket,
      attention: attention.slice(0, 8),
      attentionCount: attention.length,
      topByOrders,
      newest,
    };
  }, [stores, billing]);

  const chartMax = useMemo(() => {
    const series = billing?.monthlySeries || [];
    return Math.max(1, ...series.map((p) => p.mrr));
  }, [billing]);

  const planEntries = useMemo(() => {
    if (!billing) return [];
    return Object.entries(billing.byPlan).sort(
      (a, b) => b[1].revenue - a[1].revenue,
    );
  }, [billing]);

  const statusEntries = useMemo(() => {
    if (!billing) return [];
    const order = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'];
    return Object.entries(billing.byStatus).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [billing]);

  const maxPlanRev = Math.max(1, ...planEntries.map(([, d]) => d.revenue));

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-8 w-48 bg-[#e4e7ec]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 border border-[#d9dde3] bg-white" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-56 border border-[#d9dde3] bg-white lg:col-span-3" />
          <div className="h-56 border border-[#d9dde3] bg-white lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Dashboard
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">{todayLabel()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold ${
              mp?.paymentsEnabled
                ? 'border-[#b7e4c7] bg-[#f0faf4] text-[#1b8f4a]'
                : 'border-[#f5c2c7] bg-[#fff5f5] text-[#b42318]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                mp?.paymentsEnabled ? 'bg-[#1b8f4a]' : 'bg-[#b42318]'
              }`}
            />
            MP {mp?.paymentsEnabled ? 'ok' : 'pendente'}
            {mp?.mpUseSandbox ? ' · sandbox' : mp ? ' · prod' : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          <Link href="/super/lojas" className="btn btn-accent text-xs">
            Gerenciar lojas
          </Link>
        </div>
      </header>

      {error ? (
        <p className="border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}

      {/* KPIs principais */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden border border-[#171a1f] bg-[#171a1f] px-4 py-4 text-white sm:col-span-2 xl:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
            MRR
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {moneyBr(stats.mrr)}
          </p>
          <p className="mt-2 text-xs text-white/65">
            Potencial {moneyBr(stats.potential)} · captura {stats.capture}%
          </p>
          <div className="mt-3 h-1 bg-white/15">
            <div
              className="h-1 bg-[#4ade80] transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(100, Math.max(4, stats.capture))}%` }}
            />
          </div>
        </div>

        <Link
          href="/super/lojas"
          className="border border-[#d9dde3] bg-white px-4 py-4 transition-colors hover:border-[#171a1f]"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Lojas
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{stats.total}</p>
          <p className="mt-2 text-xs text-muted">
            {stats.active.length} ativas · {stats.trial.length} trial ·{' '}
            {stats.paying} pagando
          </p>
        </Link>

        <Link
          href="/super/lojas?plan=expired"
          className="border border-[#d9dde3] bg-white px-4 py-4 transition-colors hover:border-[#171a1f]"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Precisam atenção
          </p>
          <p
            className={`mt-2 text-3xl font-bold tracking-tight ${
              stats.attentionCount > 0 ? 'text-accent' : 'text-ink'
            }`}
          >
            {stats.attentionCount}
          </p>
          <p className="mt-2 text-xs text-muted">
            {stats.expired.length} vencidas · {stats.expiring.length} vencendo ·{' '}
            {stats.pastDue.length} em atraso
          </p>
        </Link>

        <div className="border border-[#d9dde3] bg-white px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Em atraso
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#b54708]">
            {moneyBr(stats.overdue)}
          </p>
          <p className="mt-2 text-xs text-muted">
            Trial {moneyBr(stats.trialAmount)} · ticket médio{' '}
            {moneyBr(stats.avgTicket)}
          </p>
        </div>
      </section>

      {/* Saúde da rede */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Produtos', value: stats.products, href: '/super/lojas' },
          { label: 'Pedidos', value: stats.orders, href: '/super/lojas' },
          { label: 'Clientes', value: stats.customers, href: '/super/lojas' },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-baseline justify-between border border-[#d9dde3] bg-white px-4 py-3 transition-colors hover:border-[#171a1f]"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              {item.label}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {item.value.toLocaleString('pt-BR')}
            </span>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Gráfico MRR */}
        <section className="border border-[#d9dde3] bg-white p-4 xl:col-span-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">MRR estimado</h2>
              <p className="mt-0.5 text-xs text-muted">
                Últimos 6 meses · lojas ativas com mensalidade
              </p>
            </div>
            {billing?.monthlySeries?.length ? (
              <p className="text-sm font-semibold tabular-nums text-[#1b8f4a]">
                {moneyBr(
                  billing.monthlySeries[billing.monthlySeries.length - 1]?.mrr ||
                    0,
                )}
              </p>
            ) : null}
          </div>

          {billing?.monthlySeries?.length ? (
            <div className="mt-6 flex h-48 items-end gap-2.5 sm:gap-3">
              {billing.monthlySeries.map((point, idx) => {
                const h = Math.max(6, (point.mrr / chartMax) * 100);
                const isLast = idx === billing.monthlySeries.length - 1;
                return (
                  <div
                    key={point.month}
                    className="group flex flex-1 flex-col items-center gap-1.5"
                    title={`${point.label}: ${moneyBr(point.mrr)} · ${point.stores} lojas`}
                  >
                    <span
                      className={`text-[10px] font-semibold tabular-nums ${
                        isLast ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {moneyCompact(point.mrr).replace(/\s/g, '\u00a0')}
                    </span>
                    <div className="relative flex w-full flex-1 items-end">
                      <div
                        className={`w-full transition-[height] duration-700 ease-out ${
                          isLast ? 'bg-[#171a1f]' : 'bg-[#c5cad3] group-hover:bg-[#171a1f]'
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      {point.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted/80">
                      {point.stores} lj
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-8 text-sm text-muted">Sem histórico ainda.</p>
          )}
        </section>

        {/* Mix de planos */}
        <section className="border border-[#d9dde3] bg-white p-4 xl:col-span-2">
          <h2 className="text-sm font-bold">Mix de planos</h2>
          <p className="mt-0.5 text-xs text-muted">Receita por plano cadastrado</p>
          <ul className="mt-5 space-y-4">
            {planEntries.map(([plan, data]) => (
              <li key={plan}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold capitalize">{plan}</span>
                  <span className="tabular-nums text-muted">
                    {moneyBr(data.revenue)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-[#eef0f3]">
                    <div
                      className="h-1.5 bg-[#1b8f4a] transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(3, (data.revenue / maxPlanRev) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-[11px] tabular-nums text-muted">
                    {data.count}
                  </span>
                </div>
              </li>
            ))}
            {planEntries.length === 0 ? (
              <li className="text-sm text-muted">Nenhum plano ainda.</li>
            ) : null}
          </ul>

          <div className="mt-6 border-t border-[#ebebeb] pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Por status
            </p>
            <div className="mt-3 flex h-2 overflow-hidden bg-[#eef0f3]">
              {statusEntries.map(([st, data]) => {
                const width = pct(data.count, stats.total || 1);
                if (!width) return null;
                const color =
                  st === 'ACTIVE'
                    ? 'bg-[#1b8f4a]'
                    : st === 'TRIAL'
                      ? 'bg-[#5b6cff]'
                      : st === 'PAST_DUE'
                        ? 'bg-[#e87b1a]'
                        : 'bg-[#b42318]';
                return (
                  <div
                    key={st}
                    className={color}
                    style={{ width: `${width}%` }}
                    title={`${statusLabel[st] || st}: ${data.count}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {statusEntries.map(([st, data]) => (
                <Link
                  key={st}
                  href={`/super/lojas?status=${st}`}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 ${statusTone(st)}`}
                >
                  {statusLabel[st] || st} {data.count}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Atenção */}
        <section className="border border-[#d9dde3] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#ebebeb] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Fila de atenção</h2>
              <p className="text-xs text-muted">
                Vencidas, vencendo ou em atraso
              </p>
            </div>
            {stats.attentionCount > 0 ? (
              <Link
                href="/super/lojas?plan=expired"
                className="text-xs font-semibold text-accent hover:underline"
              >
                Ver todas
              </Link>
            ) : null}
          </div>
          {stats.attention.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Nenhuma loja crítica no momento.
            </p>
          ) : (
            <ul className="divide-y divide-[#ebebeb]">
              {stats.attention.map((s) => {
                const badge = planBadge(s);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <p className="text-xs text-muted">
                        /{s.slug} · {formatDate(s.planDueAt)} ·{' '}
                        {feeNumber(s.monthlyFee) > 0
                          ? moneyBr(feeNumber(s.monthlyFee))
                          : 'sem fee'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                      <Link
                        href={`/super/lojas?q=${encodeURIComponent(s.slug)}`}
                        className="btn btn-ghost px-2 py-1 text-xs"
                      >
                        Abrir
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top lojas */}
        <section className="border border-[#d9dde3] bg-white">
          <div className="border-b border-[#ebebeb] px-4 py-3">
            <h2 className="text-sm font-bold">Mais pedidos</h2>
            <p className="text-xs text-muted">Ranking na rede</p>
          </div>
          {stats.topByOrders.every((s) => !(s._count?.orders > 0)) ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Ainda sem pedidos nas lojas.
            </p>
          ) : (
            <ul className="divide-y divide-[#ebebeb]">
              {stats.topByOrders.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="w-5 text-xs font-bold tabular-nums text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s._count.products} produtos · {s._count.customers}{' '}
                      clientes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">
                      {s._count.orders}
                    </p>
                    <p className="text-[10px] uppercase text-muted">pedidos</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recentes + atalhos */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="border border-[#d9dde3] bg-white lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[#ebebeb] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Lojas recentes</h2>
              <p className="text-xs text-muted">Últimas cadastradas</p>
            </div>
            <Link
              href="/super/lojas"
              className="text-xs font-semibold text-ink hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {stats.newest.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Nenhuma loja cadastrada.
            </p>
          ) : (
            <ul className="divide-y divide-[#ebebeb]">
              {stats.newest.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">
                      /loja/{s.slug} · {s.admin?.email || 'sem admin'} · plano{' '}
                      {s.planName}
                    </p>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusTone(s.status)}`}
                  >
                    {statusLabel[s.status] || s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col border border-[#d9dde3] bg-white lg:col-span-2">
          <div className="border-b border-[#ebebeb] px-4 py-3">
            <h2 className="text-sm font-bold">Atalhos</h2>
            <p className="text-xs text-muted">Operação rápida</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-4">
            <Link
              href="/super/lojas"
              className="flex items-center justify-between border border-[#d9dde3] px-3 py-2.5 text-sm font-semibold transition-colors hover:border-[#171a1f] hover:bg-[#f7f8fa]"
            >
              Todas as lojas
              <span className="text-muted">→</span>
            </Link>
            <Link
              href="/super/lojas?status=TRIAL"
              className="flex items-center justify-between border border-[#d9dde3] px-3 py-2.5 text-sm font-semibold transition-colors hover:border-[#171a1f] hover:bg-[#f7f8fa]"
            >
              Trials
              <span className="tabular-nums text-muted">
                {stats.trial.length}
              </span>
            </Link>
            <Link
              href="/super/lojas?plan=expiring"
              className="flex items-center justify-between border border-[#d9dde3] px-3 py-2.5 text-sm font-semibold transition-colors hover:border-[#171a1f] hover:bg-[#f7f8fa]"
            >
              Vencendo em 7 dias
              <span className="tabular-nums text-muted">
                {stats.expiring.length}
              </span>
            </Link>
            <Link
              href="/super/mercadopago"
              className="flex items-center justify-between border border-[#d9dde3] px-3 py-2.5 text-sm font-semibold transition-colors hover:border-[#171a1f] hover:bg-[#f7f8fa]"
            >
              Mercado Pago
              <span className="text-muted">
                {mp?.paymentsEnabled ? 'configurado' : 'configurar'}
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
