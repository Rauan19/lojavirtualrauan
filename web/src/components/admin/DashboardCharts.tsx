'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money } from '@/lib/api';
import { orderStatusLabel } from '@/lib/order-status';

/**
 * Paleta categórica validada com o checador do skill dataviz (banda de
 * luminosidade, piso de croma, separação para daltonismo e contraste).
 * A ordem é fixa: cor segue a entidade, nunca a posição no ranking.
 */
const SERIES = {
  revenue: '#2f6fd0',
  orders: '#1b8f4a',
} as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#e0902b',
  PAID: '#1b8f4a',
  PROCESSING: '#2f6fd0',
  SHIPPED: '#8e5fc0',
  DELIVERED: '#1b8f4a',
  CANCELLED: '#8a929e',
  REFUNDED: '#d64550',
};

const AXIS = { fill: '#6b7280', fontSize: 11 };
const GRID = '#e9ebef';

function compactMoney(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

function TooltipBox({
  label,
  rows,
}: {
  label?: string;
  rows: { name: string; value: string; color: string }[];
}) {
  return (
    <div className="border border-line bg-white px-2.5 py-1.5 text-xs shadow-lg">
      {label ? <p className="mb-1 font-semibold text-ink">{label}</p> : null}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5 text-muted">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: r.color }}
            aria-hidden
          />
          {r.name}: <strong className="text-ink">{r.value}</strong>
        </p>
      ))}
    </div>
  );
}

type SeriesPoint = { label: string; orders: number; revenue: number };

/** Faturamento ao longo do período — área, porque a leitura é de tendência. */
export function RevenueAreaChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Sem dados no período</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.revenue} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES.revenue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={compactMoney}
        />
        <Tooltip
          cursor={{ stroke: '#c7ccd4', strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: 'Faturamento',
                    value: money(Number(payload[0].value)),
                    color: SERIES.revenue,
                  },
                  {
                    name: 'Pedidos',
                    value: String(payload[0].payload.orders),
                    color: SERIES.orders,
                  },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={SERIES.revenue}
          strokeWidth={2}
          fill="url(#fillRevenue)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Volume de pedidos — barra, porque a leitura é de magnitude por período. */
export function OrdersBarChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Sem dados no período</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={16}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(47,111,208,0.06)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={String(label)}
                rows={[
                  {
                    name: 'Pedidos',
                    value: String(payload[0].value),
                    color: SERIES.orders,
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="orders"
          fill={SERIES.orders}
          radius={[4, 4, 0, 0]}
          maxBarSize={34}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Pedidos por status — barra horizontal: rótulo longo pede eixo Y de texto. */
export function StatusBarChart({
  data,
}: {
  data: { status: string; count: number }[];
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Sem pedidos</p>;
  }

  const rows = data.map((s) => ({
    ...s,
    label: orderStatusLabel(s.status),
    color: STATUS_COLORS[s.status] || '#8a929e',
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={104}
        />
        <Tooltip
          cursor={{ fill: 'rgba(47,111,208,0.06)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                rows={[
                  {
                    name: payload[0].payload.label,
                    value: `${payload[0].value} pedidos`,
                    color: payload[0].payload.color,
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.status} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
