import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCustomDomain } from '../common/utils/normalize-domain';

/**
 * Endpoints públicos (sem tenant) — resolve host → slug para o middleware Next.
 */
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  /** Planos exibidos no signup — antes de existir conta não dá pra chamar a rota autenticada. */
  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
  }

  /** Lojas ativas — alimenta o sitemap da plataforma. Sem dado sensível. */
  @Get('stores')
  async listStores() {
    const stores = await this.prisma.store.findMany({
      where: { status: { in: [StoreStatus.ACTIVE, StoreStatus.TRIAL] } },
      select: { slug: true, customDomain: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return stores;
  }

  @Get('health')
  async health() {
    // Consulta trivial: prova que o pool do banco responde, não só que o
    // processo Node está de pé.
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, at: new Date().toISOString() };
  }

  @Get('resolve-host')
  async resolveHost(@Query('host') hostRaw?: string) {
    const host = normalizeCustomDomain(hostRaw || '');
    if (!host) {
      throw new NotFoundException('Host inválido');
    }

    const store = await this.prisma.store.findFirst({
      where: {
        OR: [{ customDomain: host }, { customDomain: `www.${host}` }],
      },
      select: { slug: true, name: true, status: true, customDomain: true },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada para este domínio');
    }

    return {
      slug: store.slug,
      name: store.name,
      status: store.status,
      customDomain: store.customDomain,
    };
  }
}
