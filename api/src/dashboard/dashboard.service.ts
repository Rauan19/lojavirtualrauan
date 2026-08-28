import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Period = 'day' | 'week' | 'month' | 'year';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    storeId: string,
    from?: string,
    to?: string,
    period: Period = 'month',
    status?: OrderStatus,
    date?: string,
  ) {
    const range = this.resolveRange(period, from, to, date);
    const seriesPeriod =
      date || this.isSameCalendarDay(range.from, range.to) ? 'day' : period;

    const createdAt: Prisma.DateTimeFilter = {
      gte: range.from,
      lte: range.to,
    };

    const where: Prisma.OrderWhereInput = {
      storeId,
      createdAt,
      ...(status ? { status } : {}),
    };

    const paidWhere: Prisma.OrderWhereInput = {
      ...where,
      paymentStatus: PaymentStatus.APPROVED,
    };

    const [
      ordersCount,
      paidOrders,
      revenueAgg,
      byStatus,
      topProducts,
      recentOrders,
      seriesOrders,
    ] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: paidWhere }),
      this.prisma.order.aggregate({
        where: paidWhere,
        _sum: { total: true },
        _avg: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productName'],
        where: { order: paidWhere },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          total: true,
          customerName: true,
          createdAt: true,
        },
      }),
      this.prisma.order.findMany({
        where,
        select: {
          createdAt: true,
          total: true,
          paymentStatus: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const revenue = Number(revenueAgg._sum.total ?? 0);
    const ticketMedio = Number(revenueAgg._avg.total ?? 0);

    return {
      period: date ? 'day' : period,
      date: date || null,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      ordersCount,
      paidOrders,
      revenue,
      ticketMedio,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
      topProducts: topProducts.map((p) => ({
        productName: p.productName,
        quantity: p._sum.quantity ?? 0,
        total: Number(p._sum.total ?? 0),
      })),
      recentOrders,
      series: this.buildSeries(
        seriesOrders,
        seriesPeriod,
        range.from,
        range.to,
      ),
    };
  }

  private isSameCalendarDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  /** Interpreta YYYY-MM-DD no fuso local do servidor. */
  private parseLocalDay(isoDate: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const month = Number(m[2]);
    const d = Number(m[3]);
    if (!y || month < 1 || month > 12 || d < 1 || d > 31) return null;
    return { y, month, d };
  }

  private dayBounds(isoDate: string) {
    const parsed = this.parseLocalDay(isoDate);
    if (!parsed) return null;
    const from = new Date(parsed.y, parsed.month - 1, parsed.d, 0, 0, 0, 0);
    const to = new Date(parsed.y, parsed.month - 1, parsed.d, 23, 59, 59, 999);
    return { from, to };
  }

  private resolveRange(
    period: Period,
    from?: string,
    to?: string,
    date?: string,
  ) {
    if (date) {
      const bounds = this.dayBounds(date);
      if (bounds) return bounds;
    }

    if (from || to) {
      const start = from
        ? (this.dayBounds(from.slice(0, 10))?.from ?? new Date(from))
        : new Date(0);
      const end = to
        ? (this.dayBounds(to.slice(0, 10))?.to ?? new Date(to))
        : new Date();
      return { from: start, to: end };
    }

    const end = new Date();
    const start = new Date(end);

    // Janelas móveis (não calendário) — no dia 1 do mês o "mês" ainda
    // precisa mostrar as vendas recentes, senão o dashboard fica zerado.
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
    }

    return { from: start, to: end };
  }

  private buildSeries(
    orders: {
      createdAt: Date;
      total: Prisma.Decimal;
      paymentStatus: PaymentStatus;
    }[],
    period: Period,
    from: Date,
    to: Date,
  ) {
    const buckets = new Map<
      string,
      { label: string; orders: number; revenue: number }
    >();
    const cursor = new Date(from);

    const keyOf = (d: Date) => {
      if (period === 'day') {
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      }
      if (period === 'year') {
        return `${d.getFullYear()}-${d.getMonth()}`;
      }
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    const labelOf = (d: Date) => {
      if (period === 'day') {
        return `${String(d.getHours()).padStart(2, '0')}h`;
      }
      if (period === 'year') {
        return d.toLocaleDateString('pt-BR', { month: 'short' });
      }
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
    };

    const step = () => {
      if (period === 'day') cursor.setHours(cursor.getHours() + 1);
      else if (period === 'year') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    };

    const guard = new Date(to);
    let safety = 0;
    while (cursor <= guard && safety < 400) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) {
        buckets.set(k, { label: labelOf(cursor), orders: 0, revenue: 0 });
      }
      step();
      safety += 1;
    }

    for (const order of orders) {
      const d = new Date(order.createdAt);
      const k = keyOf(d);
      const bucket = buckets.get(k);
      if (!bucket) continue;
      bucket.orders += 1;
      if (order.paymentStatus === PaymentStatus.APPROVED) {
        bucket.revenue += Number(order.total);
      }
    }

    return Array.from(buckets.values());
  }
}
