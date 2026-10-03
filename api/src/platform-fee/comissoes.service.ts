import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformFeeEntryType, Prisma } from '@prisma/client';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { celulaCsv, intervaloDoMes, mesAnterior, reaisCsv } from './relatorio';

export const FILTROS_LOJAS = ['movimento', 'taxa', 'todas'] as const;
export type FiltroLojas = (typeof FILTROS_LOJAS)[number];
export const ORDENS_LOJAS = ['liquido', 'vendas', 'nome'] as const;
export type OrdemLojas = (typeof ORDENS_LOJAS)[number];

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

  /**
   * Resumo do mês para o Super Admin: totais, mês anterior para comparar e
   * as contagens. A lista de lojas e a de divergências vêm paginadas à parte
   * (lojasDoMes, divergencias): com milhares de lojas, o resumo continua leve.
   */
  async relatorio(mes?: string) {
    const intervalo = intervaloDoMes(mes);
    const anterior = intervaloDoMes(mesAnterior(intervalo.mes));
    const [porLoja, antes, divergenciasTotal] = await Promise.all([
      this.somarPorLoja(intervalo.inicio, intervalo.fim),
      this.prisma.platformFeeEntry.aggregate({
        where: { createdAt: { gte: anterior.inicio, lt: anterior.fim } },
        _sum: { amountCents: true },
      }),
      this.prisma.order.count({ where: { platformFeeMismatch: true } }),
    ]);
    const totais = zerado();
    for (const t of porLoja.values()) {
      totais.cobradoCents += t.cobradoCents;
      totais.devolvidoCents += t.devolvidoCents;
      totais.liquidoCents += t.liquidoCents;
      totais.pedidos += t.pedidos;
    }
    return {
      mes: intervalo.mes,
      geral: {
        ligadaNoGeral: this.ligadaNoGeral(),
        prazoConexao: this.prazoOauth(),
      },
      totais,
      mesAnterior: {
        mes: anterior.mes,
        liquidoCents: antes._sum.amountCents ?? 0,
      },
      lojasComMovimento: porLoja.size,
      divergenciasTotal,
    };
  }

  /**
   * Lojas do mês, paginadas no banco. Ordem por valor: primeiro as lojas com
   * movimento (ordenadas pelo valor), depois as sem movimento por nome; só
   * as lojas da página são lidas por completo.
   */
  async lojasDoMes(
    mes: string | undefined,
    opcoes: {
      pagina?: number;
      porPagina?: number;
      busca?: string;
      filtro?: FiltroLojas;
      ordem?: OrdemLojas;
    },
  ) {
    const intervalo = intervaloDoMes(mes);
    const porPagina = Math.min(Math.max(opcoes.porPagina || 25, 1), 100);
    const filtro = opcoes.filtro ?? 'movimento';
    const ordem = opcoes.ordem ?? 'liquido';
    const porLoja = await this.somarPorLoja(intervalo.inicio, intervalo.fim);
    const taxaDe = await this.planLimits.taxaPorPlano();
    const comMovimento = [...porLoja.keys()];

    const busca = opcoes.busca?.trim();
    const soDigitos = busca?.replace(/\D/g, '') ?? '';
    const where: Prisma.StoreWhereInput = busca
      ? {
          OR: [
            { name: { contains: busca, mode: 'insensitive' } },
            { slug: { contains: busca, mode: 'insensitive' } },
            { sellerLegalName: { contains: busca, mode: 'insensitive' } },
            ...(soDigitos.length >= 3
              ? [{ sellerDocument: { contains: soDigitos } }]
              : []),
          ],
        }
      : {};
    if (filtro === 'movimento') {
      where.id = { in: comMovimento };
    } else if (filtro === 'taxa') {
      // Poucos nomes de plano distintos: resolve a taxa de cada um aqui
      const planos = await this.prisma.store.groupBy({ by: ['planName'] });
      where.planName = {
        in: planos.map((p) => p.planName).filter((n) => taxaDe(n) > 0),
      };
    }

    const total = await this.prisma.store.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(opcoes.pagina || 1, 1), totalPaginas);
    const inicio = (pagina - 1) * porPagina;

    let ids: string[];
    if (ordem === 'nome') {
      const linhas = await this.prisma.store.findMany({
        where,
        select: { id: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: inicio,
        take: porPagina,
      });
      ids = linhas.map((l) => l.id);
    } else {
      // Lojas com movimento que passam no filtro, ordenadas pelo valor
      const movimentadas = (
        await this.prisma.store.findMany({
          where: { AND: [where, { id: { in: comMovimento } }] },
          select: { id: true, name: true },
        })
      ).sort((a, b) => {
        const ta = porLoja.get(a.id) ?? zerado();
        const tb = porLoja.get(b.id) ?? zerado();
        const d =
          ordem === 'vendas'
            ? tb.pedidos - ta.pedidos
            : tb.liquidoCents - ta.liquidoCents;
        return d || a.name.localeCompare(b.name, 'pt-BR');
      });
      ids = movimentadas.slice(inicio, inicio + porPagina).map((l) => l.id);
      const faltam = porPagina - ids.length;
      if (faltam > 0 && filtro !== 'movimento') {
        const resto = await this.prisma.store.findMany({
          where: { AND: [where, { id: { notIn: comMovimento } }] },
          select: { id: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: Math.max(0, inicio - movimentadas.length),
          take: faltam,
        });
        ids.push(...resto.map((l) => l.id));
      }
    }

    const detalhes = await this.prisma.store.findMany({
      where: { id: { in: ids } },
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
    });
    const porId = new Map(detalhes.map((d) => [d.id, d]));
    const itens = ids.flatMap((id) => {
      const l = porId.get(id);
      return l
        ? [this.linhaDaLoja(l, porLoja.get(id) ?? zerado(), taxaDe)]
        : [];
    });

    return {
      mes: intervalo.mes,
      itens,
      total,
      pagina,
      porPagina,
      totalPaginas,
    };
  }

  /** Divergências abertas (MP reteve valor diferente), paginadas. */
  async divergencias(pagina = 1, porPagina = 10) {
    const tamanho = Math.min(Math.max(porPagina, 1), 100);
    const where = { platformFeeMismatch: true };
    const total = await this.prisma.order.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
    const atual = Math.min(Math.max(pagina, 1), totalPaginas);
    const linhas = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        mpPaymentId: true,
        platformFeeCents: true,
        platformFeeChargedCents: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (atual - 1) * tamanho,
      take: tamanho,
    });
    return {
      itens: linhas.map((d) => ({
        orderId: d.id,
        orderNumber: d.orderNumber,
        createdAt: d.createdAt,
        mpPaymentId: d.mpPaymentId,
        esperadoCents: d.platformFeeCents ?? 0,
        retidoCents: d.platformFeeChargedCents ?? 0,
        storeId: d.store.id,
        loja: d.store.name,
      })),
      total,
      pagina: atual,
      porPagina: tamanho,
      totalPaginas,
    };
  }

  private linhaDaLoja(
    l: {
      id: string;
      name: string;
      slug: string;
      status: string;
      planName: string;
      platformFeeEnabled: boolean | null;
      mpRefreshToken: string | null;
      sellerDocument: string | null;
      sellerLegalName: string | null;
    },
    t: Totais,
    taxaDe: (planName: string | null) => number,
  ) {
    return {
      storeId: l.id,
      nome: l.name,
      slug: l.slug,
      status: l.status,
      plano: l.planName,
      feeBps: taxaDe(l.planName),
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
  }

  /**
   * CSV do mês por loja, para emitir a NFS-e da comissão. Separador ";" e
   * valores com vírgula: abre direto no Excel em português. Todas as lojas
   * com movimento (não é paginado).
   */
  async csv(mes?: string) {
    const intervalo = intervaloDoMes(mes);
    const porLoja = await this.somarPorLoja(intervalo.inicio, intervalo.fim);
    const lojas = await this.prisma.store.findMany({
      where: { id: { in: [...porLoja.keys()] } },
      select: {
        id: true,
        name: true,
        slug: true,
        sellerDocument: true,
        sellerLegalName: true,
      },
      orderBy: { name: 'asc' },
    });
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
    const linhas = lojas
      .map((l) => ({ l, t: porLoja.get(l.id) ?? zerado() }))
      .filter(({ t }) => t.cobradoCents !== 0 || t.devolvidoCents !== 0)
      .map(({ l, t }) =>
        [
          intervalo.mes,
          l.name,
          l.slug,
          l.sellerLegalName,
          l.sellerDocument,
          t.pedidos,
          reaisCsv(t.cobradoCents),
          reaisCsv(t.devolvidoCents),
          reaisCsv(t.liquidoCents),
        ]
          .map(celulaCsv)
          .join(';'),
      );
    // BOM: o Excel só reconhece acento em CSV UTF-8 com ele
    return '\uFEFF' + [cab.map(celulaCsv).join(';'), ...linhas].join('\r\n');
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
