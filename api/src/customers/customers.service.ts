import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerQueryDto } from './dto/customer.dto';

/** Só pedido pago conta como faturamento do cliente. */
const PAID = { paymentStatus: PaymentStatus.APPROVED };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, query: CustomerQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const q = query.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      storeId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          passwordHash: true,
        },
        orderBy:
          query.sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
        // Em `spent`/`orders` a ordenação é por dado agregado, que o Prisma
        // não ordena junto: pagina depois, sobre a página já enriquecida.
        ...(query.sort === 'spent' || query.sort === 'orders'
          ? {}
          : { skip: (page - 1) * limit, take: limit }),
      }),
      this.prisma.customer.count({ where }),
    ]);

    const stats = await this.statsFor(
      storeId,
      rows.map((c) => c.id),
    );

    let items = rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
      /** Comprou sem criar senha (checkout antigo de convidado). */
      hasAccount: Boolean(c.passwordHash),
      orders: stats.get(c.id)?.orders ?? 0,
      totalSpent: stats.get(c.id)?.totalSpent ?? 0,
      lastOrderAt: stats.get(c.id)?.lastOrderAt ?? null,
    }));

    if (query.sort === 'spent' || query.sort === 'orders') {
      const key = query.sort === 'spent' ? 'totalSpent' : 'orders';
      items.sort((a, b) => b[key] - a[key]);
      items = items.slice((page - 1) * limit, page * limit);
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Pedidos pagos, total gasto e data da última compra — numa consulta só. */
  private async statsFor(storeId: string, customerIds: string[]) {
    const map = new Map<
      string,
      { orders: number; totalSpent: number; lastOrderAt: Date | null }
    >();
    if (!customerIds.length) return map;

    const rows = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { storeId, customerId: { in: customerIds }, ...PAID },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    });

    for (const row of rows) {
      if (!row.customerId) continue;
      map.set(row.customerId, {
        orders: row._count._all,
        totalSpent: Number(row._sum.total ?? 0),
        lastOrderAt: row._max.createdAt,
      });
    }
    return map;
  }

  async getOne(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        cpf: true,
        createdAt: true,
        passwordHash: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const [orders, agg] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId, customerId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          total: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.order.aggregate({
        where: { storeId, customerId, ...PAID },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    const { passwordHash, ...rest } = customer;
    return {
      ...rest,
      hasAccount: Boolean(passwordHash),
      paidOrders: agg._count._all,
      totalSpent: Number(agg._sum.total ?? 0),
      orders,
    };
  }
}
