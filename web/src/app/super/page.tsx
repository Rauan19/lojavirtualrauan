'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import {
  BillingSummary,
  feeNumber,
  formatDate,
  moneyBr,
  planBadge,
  PlatformMpSettings,
  statusLabel,
  statusTone,
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

export default function SuperDashboardPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [mp, setMp] = useState<PlatformMpSettings | null>(null);
  /*
   * Colaborador da equipe só vê o que tem liberado: sem a área de planos,
   * nada de faturamento; Mercado Pago da plataforma é só do dono. Esconde
   * em vez de mostrar R$ 0,00 ou "pendente", que seria informação falsa.
   */
  const [verFinanceiro, setVerFinanceiro] = useState(true);
  const [verMp, setVerMp] = useState(true);
  useEffect(() => {
    const u = getUser();
    const dono = u?.dono !== false;
    setVerFinanceiro(dono || Boolean(u?.permissoes?.includes('planos')));
    setVerMp(dono);
  }, []);
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
        // Colaborador sem a área de planos não vê o faturamento: segue sem ele
        api<BillingSummary>('/stores/billing', { token }).catch(() => null),
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
      <div className="admin-page animate-pulse">
        <div className="h-11 w-56 rounded-xl bg-[#e4e7ec]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-line bg-white"
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-56 rounded-2xl border border-line bg-white lg:col-span-3" />
          <div className="h-56 rounded-2xl border border-line bg-white lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <CabecalhoPagina
        icone="/super"
        titulo="Visão geral"
        descricao={<span className="capitalize">{todayLabel()}</span>}
        acoes={
          <>
            {verMp ? (
              <span
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${
                  mp?.paymentsEnabled
                    ? 'bg-[#e8f6ee] text-[#166534]'
                    : 'bg-[#fde8e8] text-[#b42318]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    mp?.paymentsEnabled ? 'bg-[#1b8f4a]' : 'bg-[#b42318]'
                  }`}
                />
                Mercado Pago {mp?.paymentsEnabled ? 'ok' : 'pendente'}
                {mp?.mpUseSandbox ? ' · teste' : mp ? ' · produção' : ''}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost h-9 px-3 text-[13px]"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              {refreshing ? 'Atualizando…' : 'Atualizar'}
            </button>
            <Link
              href="/super/lojas"
              className="btn btn-accent h-9 px-3 text-[13px]"
            >
              Gerenciar lojas
            </Link>
          </>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-5 py-3 text-sm text-[#b42318]"
        >
          {error}
        </p>
      ) : null}

      {/* KPIs principais */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {verFinanceiro ? (
          <div className="relative overflow-hidden rounded-2xl bg-[var(--brand-deep)] px-5 py-4 text-white sm:col-span-2 xl:col-span-1">
            <p className="text-[13px] font-medium text-white/75">
              Receita mensal (MRR)
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {moneyBr(stats.mrr)}
            </p>
            <p className="mt-2 text-xs text-white/75">
              Potencial {moneyBr(stats.potential)} · captura {stats.capture}%
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-1.5 rounded-full bg-[#7fd1a0] transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(4, stats.capture))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <Link
          href="/super/lojas"
          className="rounded-2xl border border-line bg-white px-5 py-4 transition-colors hover:border-[var(--brand-teal)]"
        >
          <p className="text-[13px] font-medium text-muted">Lojas</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {stats.total}
          </p>
          <p className="mt-2 text-xs text-muted">
            {stats.active.length} ativas · {stats.trial.length} em teste ·{' '}
            {stats.paying} pagando
          </p>
        </Link>

        <Link
          href="/super/lojas?plan=expired"
          className="rounded-2xl border border-line bg-white px-5 py-4 transition-colors hover:border-[var(--brand-teal)]"
        >
          <p className="text-[13px] font-medium text-muted">
            Precisam de atenção
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

        {verFinanceiro ? (
          <div className="rounded-2xl border border-line bg-white px-5 py-4">
            <p className="text-[13px] font-medium text-muted">Em atraso</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#b54708]">
              {moneyBr(stats.overdue)}
            </p>
            <p className="mt-2 text-xs text-muted">
              Em teste {moneyBr(stats.trialAmount)} · ticket médio{' '}
              {moneyBr(stats.avgTicket)}
            </p>
          </div>
        ) : null}
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
            className="flex items-baseline justify-between rounded-2xl border border-line bg-white px-5 py-3.5 transition-colors hover:border-[var(--brand-teal)]"
          >
            <span className="text-[13px] font-medium text-muted">
              {item.label}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {item.value.toLocaleString('pt-BR')}
            </span>
          </Link>
        ))}
      </section>

      {verFinanceiro ? (
        <div className="grid gap-4 xl:grid-cols-5">
          {/* Gráfico MRR */}
          <section className="rounded-2xl border border-line bg-white p-5 xl:col-span-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold">MRR estimado</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Últimos 6 meses · lojas ativas com mensalidade
                </p>
              </div>
              {billing?.monthlySeries?.length ? (
                <p className="text-[15px] font-bold tabular-nums text-[#166534]">
                  {moneyBr(
                    billing.monthlySeries[billing.monthlySeries.length - 1]
                      ?.mrr || 0,
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
                        className={`text-[11px] font-semibold tabular-nums ${
                          isLast ? 'text-ink' : 'text-muted'
                        }`}
                      >
                        {moneyCompact(point.mrr).replace(/\s/g, '\u00a0')}
                      </span>
                      <div className="relative flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-t-md transition-[height] duration-700 ease-out ${
                            isLast
                              ? 'bg-[var(--brand-deep)]'
                              : 'bg-[#c9dde2] group-hover:bg-[var(--brand-teal)]'
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className="text-[11px] capitalize text-muted">
                        {point.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted/80">
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
          <section className="rounded-2xl border border-line bg-white p-5 xl:col-span-2">
            <h2 className="text-[15px] font-bold">Mix de planos</h2>
            <p className="mt-0.5 text-xs text-muted">
              Receita por plano cadastrado
            </p>
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
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef0f3]">
                      <div
                        className="h-1.5 rounded-full bg-[var(--brand-teal)] transition-[width] duration-700 ease-out"
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

            <div className="mt-6 border-t border-line pt-4">
              <p className="text-[13px] font-semibold text-muted">Por status</p>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#eef0f3]">
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
                    className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-opacity hover:opacity-80 ${statusTone(st)}`}
                  >
                    {statusLabel[st] || st} {data.count}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Atenção */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-bold">Fila de atenção</h2>
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
            <p className="px-5 py-10 text-center text-sm text-muted">
              Nenhuma loja crítica no momento.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.attention.map((s) => {
                const badge = planBadge(s);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
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
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                      <Link
                        href={`/super/lojas?q=${encodeURIComponent(s.slug)}`}
                        className="btn btn-ghost h-8 px-3 text-[12px]"
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
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Mais pedidos</h2>
            <p className="text-xs text-muted">Ranking na rede</p>
          </div>
          {stats.topByOrders.every((s) => !(s._count?.orders > 0)) ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Ainda sem pedidos nas lojas.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.topByOrders.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
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
                    <p className="text-[11px] text-muted">pedidos</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recentes + atalhos */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="overflow-hidden rounded-2xl border border-line bg-white lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-bold">Lojas recentes</h2>
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
            <p className="px-5 py-10 text-center text-sm text-muted">
              Nenhuma loja cadastrada.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.newest.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">
                      /loja/{s.slug} · {s.admin?.email || 'sem admin'} · plano{' '}
                      {s.planName}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(s.status)}`}
                  >
                    {statusLabel[s.status] || s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white lg:col-span-2">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Atalhos</h2>
            <p className="text-xs text-muted">Operação rápida</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-5">
            <Link
              href="/super/lojas"
              className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3 text-sm font-semibold transition-colors hover:border-[var(--brand-teal)] hover:bg-[#f4f9fa]"
            >
              Todas as lojas
              <span className="text-muted">→</span>
            </Link>
            <Link
              href="/super/lojas?status=TRIAL"
              className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3 text-sm font-semibold transition-colors hover:border-[var(--brand-teal)] hover:bg-[#f4f9fa]"
            >
              Lojas em teste
              <span className="tabular-nums text-muted">
                {stats.trial.length}
              </span>
            </Link>
            <Link
              href="/super/lojas?plan=expiring"
              className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3 text-sm font-semibold transition-colors hover:border-[var(--brand-teal)] hover:bg-[#f4f9fa]"
            >
              Vencendo em 7 dias
              <span className="tabular-nums text-muted">
                {stats.expiring.length}
              </span>
            </Link>
            {verMp ? (
              <Link
                href="/super/mercadopago"
                className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3 text-sm font-semibold transition-colors hover:border-[var(--brand-teal)] hover:bg-[#f4f9fa]"
              >
                Mercado Pago
                <span className="text-muted">
                  {mp?.paymentsEnabled ? 'configurado' : 'configurar'}
                </span>
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
