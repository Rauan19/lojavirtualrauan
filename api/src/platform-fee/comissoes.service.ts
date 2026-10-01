import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformFeeEntryType } from '@prisma/client';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { celulaCsv, intervaloDoMes, reaisCsv } from './relatorio';

type Totais = {
  cobradoCents: number;
  devolvidoCents: number;
  liquidoCents: number;
  pedidos: number;
};

const zerado = (): Totais => ({
  cobradoCents: 0,
  devolvidoCents: 0,
  liquidoCents: 0,
  pedidos: 0,
});

/**
 * Relatórios da comissão (fase 4) e a chave de liberação por loja (fase 6).
 *
 * Tudo sai do livro (PlatformFeeEntry), que só tem o que o Mercado Pago de
 * fato reteve. Cobrado = cobranças + ajustes positivos; devolvido = estornos,
 * chargebacks e ajustes negativos (positivo na tela).
 */
@Injectable()
export class ComissoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private ligadaNoGeral() {
    return this.config.get<string>('PLATFORM_FEE_ENABLED') === 'true';
  }

  private prazoOauth(): string | null {
    const bruto = this.config
      .get<string>('PLATFORM_FEE_OAUTH_DEADLINE')
      ?.trim();
    if (!bruto) return null;
    const d = new Date(bruto);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  /** Soma do livro por loja no intervalo. */
  private async somarPorLoja(inicio: Date, fim: Date, storeId?: string) {
    const grupos = await this.prisma.platformFeeEntry.groupBy({
      by: ['storeId', 'type'],
      where: {
        createdAt: { gte: inicio, lt: fim },
        ...(storeId ? { storeId } : {}),
      },
      _sum: { amountCents: true },
    });
    const pedidos = await this.prisma.platformFeeEntry.groupBy({
      by: ['storeId'],
      where: {
        createdAt: { gte: inicio, lt: fim },
        type: PlatformFeeEntryType.CHARGE,
        ...(storeId ? { storeId } : {}),
      },
      _count: { _all: true },
    });
    const porLoja = new Map<string, Totais>();
    for (const g of grupos) {
      const t = porLoja.get(g.storeId) ?? zerado();
      const v = g._sum.amountCents ?? 0;
      if (v >= 0) t.cobradoCents += v;
      else t.devolvidoCents += -v;
      t.liquidoCents += v;
      porLoja.set(g.storeId, t);
    }
    for (const p of pedidos) {
      const t = porLoja.get(p.storeId) ?? zerado();
      t.pedidos = p._count._all;
      porLoja.set(p.storeId, t);
    }
    return porLoja;
  }

  /** O que o lojista vê: taxa, conexão, prazo e o total do mês. */
  async daLoja(storeId: string, mes?: string) {
    const intervalo = intervaloDoMes(mes);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { platformFeeEnabled: true, mpRefreshToken: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const limites = await this.planLimits.forStore(storeId);
    const porLoja = await this.somarPorLoja(
      intervalo.inicio,
      intervalo.fim,
      storeId,
    );
    const cobrancaAtiva =
      (store.platformFeeEnabled ?? this.ligadaNoGeral()) && limites.feeBps > 0;
    return {
      mes: intervalo.mes,
      feeBps: limites.feeBps,
      planName: limites.planName,
      cobrancaAtiva,
      conectado: Boolean(store.mpRefreshToken),
      prazoConexao: this.prazoOauth(),
      totais: porLoja.get(storeId) ?? zerado(),
    };
  }

  /** Visão do Super Admin: mês por loja, divergências e liberação. */
  async relatorio(mes?: string) {
    const intervalo = intervaloDoMes(mes);
    const porLoja = await this.somarPorLoja(intervalo.inicio, intervalo.fim);

    // Todas as lojas com plano de taxa ou com movimento — para liberar aos poucos
    const lojas = await this.prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planName: true,
        platformFeeEnabled: true,
        mpRefreshToken: true,
        sellerDocument: true,
        sellerLegalName: true,
      },
      orderBy: { name: 'asc' },
    });

    const taxaDe = await this.planLimits.taxaPorPlano();
    const total = zerado();
    const linhas = lojas.map((l) => {
      const t = porLoja.get(l.id) ?? zerado();
      total.cobradoCents += t.cobradoCents;
      total.devolvidoCents += t.devolvidoCents;
      total.liquidoCents += t.liquidoCents;
      total.pedidos += t.pedidos;
      const feeBps = taxaDe(l.planName);
      return {
        storeId: l.id,
        nome: l.name,
        slug: l.slug,
        status: l.status,
        plano: l.planName,
        feeBps,
        conectado: Boolean(l.mpRefreshToken),
        liberacao:
          l.platformFeeEnabled === true
            ? ('ligada' as const)
            : l.platformFeeEnabled === false
              ? ('desligada' as const)
              : ('geral' as const),
        documento: l.sellerDocument,
        razaoSocial: l.sellerLegalName,
        ...t,
      };
    });

    const divergencias = await this.prisma.order.findMany({
      where: { platformFeeMismatch: true },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        mpPaymentId: true,
        platformFeeCents: true,
        platformFeeChargedCents: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      mes: intervalo.mes,
      geral: {
        ligadaNoGeral: this.ligadaNoGeral(),
        prazoConexao: this.prazoOauth(),
      },
      totais: total,
      lojas: linhas,
      divergencias: divergencias.map((d) => ({
        orderId: d.id,
        orderNumber: d.orderNumber,
        createdAt: d.createdAt,
        mpPaymentId: d.mpPaymentId,
        esperadoCents: d.platformFeeCents ?? 0,
        retidoCents: d.platformFeeChargedCents ?? 0,
        storeId: d.store.id,
        loja: d.store.name,
      })),
    };
  }

  /**
   * CSV do mês por loja, para emitir a NFS-e da comissão. Separador ";" e
   * valores com vírgula: abre direto no Excel em português.
   */
  async csv(mes?: string) {
    const r = await this.relatorio(mes);
    const cab = [
      'Mês',
      'Loja',
      'Endereço',
      'Razão social',
      'CPF/CNPJ',
      'Pedidos',
      'Cobrado (R$)',
      'Devolvido (R$)',
      'Líquido (R$)',
    ];
    const linhas = r.lojas
      .filter((l) => l.cobradoCents !== 0 || l.devolvidoCents !== 0)
      .map((l) =>
        [
          r.mes,
          l.nome,
          l.slug,
          l.razaoSocial,
          l.documento,
          l.pedidos,
          reaisCsv(l.cobradoCents),
          reaisCsv(l.devolvidoCents),
          reaisCsv(l.liquidoCents),
        ]
          .map(celulaCsv)
          .join(';'),
      );
    // BOM: o Excel só reconhece acento em CSV UTF-8 com ele
    return '﻿' + [cab.map(celulaCsv).join(';'), ...linhas].join('\r\n');
  }

  /**
   * Liberação aos poucos: true força ligada, false força desligada,
   * null segue a chave geral PLATFORM_FEE_ENABLED.
   */
  async definirLiberacao(storeId: string, valor: boolean | null) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    await this.prisma.store.update({
      where: { id: storeId },
      data: { platformFeeEnabled: valor },
    });
    return { storeId, platformFeeEnabled: valor };
  }

  /** Divergência conferida pelo Super Admin: sai da lista. */
  async resolverDivergencia(orderId: string) {
    const r = await this.prisma.order.updateMany({
      where: { id: orderId, platformFeeMismatch: true },
      data: { platformFeeMismatch: false },
    });
    if (r.count === 0)
      throw new NotFoundException('Divergência não encontrada');
    return { ok: true };
  }
}
