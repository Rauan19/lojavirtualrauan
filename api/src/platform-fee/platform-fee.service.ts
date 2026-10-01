import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { aceitouTermosDaTaxa } from '../common/legal';
import { PrismaService } from '../prisma/prisma.service';
import { calcularComissao, paraCentavos, paraReais } from './calculo';

export type ComissaoDoPedido = {
  bps: number;
  baseCents: number;
  feeCents: number;
  /** Valor para o Mercado Pago (application_fee / marketplace_fee), em R$. */
  feeReais: number;
};

/**
 * Decide se um pagamento leva a comissão da plataforma e quanto.
 *
 * Regras, nesta ordem:
 * 1. Chave geral PLATFORM_FEE_ENABLED ("true" liga) — a loja pode forçar
 *    ligada/desligada em Store.platformFeeEnabled.
 * 2. Taxa do plano da loja (PlanLimitsService.feeBps); 0 = sem comissão.
 * 3. Só dá para cobrar com o Mercado Pago conectado pelo OAuth da Vendira
 *    e com os termos da taxa aceitos. Até PLATFORM_FEE_OAUTH_DEADLINE a loja
 *    que falta um dos dois vende sem comissão (período de migração); depois
 *    disso o pagamento é recusado.
 *
 * A comissão é fotografada no pedido na primeira tentativa de pagamento e
 * reaproveitada nas seguintes: mudar o plano não altera pedido em aberto.
 */
/**
 * Loja apta a pagar comissão: Mercado Pago conectado pela Vendira (sem isso
 * não há split) e termos com a taxa aceitos (sem isso não há contrato).
 */
function pronta(store: {
  mpRefreshToken: string | null;
  termsVersion: string | null;
}) {
  return (
    Boolean(store.mpRefreshToken) && aceitouTermosDaTaxa(store.termsVersion)
  );
}

@Injectable()
export class PlatformFeeService {
  private readonly logger = new Logger(PlatformFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private ligadaNoGeral() {
    return this.config.get<string>('PLATFORM_FEE_ENABLED') === 'true';
  }

  private prazoOauthVencido(): boolean {
    const bruto = this.config
      .get<string>('PLATFORM_FEE_OAUTH_DEADLINE')
      ?.trim();
    if (!bruto) return false;
    const prazo = new Date(bruto);
    return !Number.isNaN(prazo.getTime()) && prazo.getTime() <= Date.now();
  }

  /**
   * Comissão deste pedido, ou null quando não se aplica. Grava a fotografia
   * no pedido na primeira chamada.
   */
  async paraPedido(
    storeId: string,
    order: {
      id: string;
      subtotal: unknown;
      discount: unknown;
      total: unknown;
      platformFeeBps: number | null;
      platformFeeBaseCents: number | null;
      platformFeeCents: number | null;
    },
  ): Promise<ComissaoDoPedido | null> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        platformFeeEnabled: true,
        mpRefreshToken: true,
        termsVersion: true,
      },
    });
    if (!store) return null;

    const ligada = store.platformFeeEnabled ?? this.ligadaNoGeral();
    if (!ligada) return null;

    // Já fotografada (nova tentativa de pagamento do mesmo pedido)
    if (order.platformFeeCents != null && order.platformFeeBps != null) {
      if (order.platformFeeCents <= 0) return null;
      if (!pronta(store)) return this.semConexao(storeId, order.id);
      return {
        bps: order.platformFeeBps,
        baseCents: order.platformFeeBaseCents ?? 0,
        feeCents: order.platformFeeCents,
        feeReais: paraReais(order.platformFeeCents),
      };
    }

    const { feeBps } = await this.planLimits.forStore(storeId);
    if (feeBps <= 0) return null;
    if (!pronta(store)) return this.semConexao(storeId, order.id);

    const c = calcularComissao({
      subtotalCents: paraCentavos(order.subtotal),
      discountCents: paraCentavos(order.discount),
      totalCents: paraCentavos(order.total),
      bps: feeBps,
    });

    // Grava só se ainda não havia fotografia (corrida entre duas tentativas)
    await this.prisma.order.updateMany({
      where: { id: order.id, platformFeeCents: null },
      data: {
        platformFeeBps: c.bps,
        platformFeeBaseCents: c.baseCents,
        platformFeeCents: c.feeCents,
      },
    });
    if (c.feeCents <= 0) return null;
    return { ...c, feeReais: paraReais(c.feeCents) };
  }

  /**
   * Loja com comissão mas sem o Mercado Pago conectado pela Vendira: durante
   * a migração vende sem comissão (e avisa no log); depois do prazo, não
   * cobra — o cliente vê uma mensagem genérica, o lojista vê o aviso no painel.
   */
  private semConexao(storeId: string, orderId: string): null {
    if (this.prazoOauthVencido()) {
      this.logger.warn(
        `Pagamento recusado: loja ${storeId} sem Mercado Pago conectado pela plataforma (pedido ${orderId})`,
      );
      throw new BadRequestException(
        'O pagamento desta loja está temporariamente indisponível. Tente mais tarde ou fale com a loja.',
      );
    }
    this.logger.warn(
      `Comissão não cobrada: loja ${storeId} ainda com token manual (pedido ${orderId})`,
    );
    return null;
  }
}
