import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PLATFORM_PLANS } from '../billing/platform-plans';

export type PlanLimits = {
  /** Nome do plano que definiu os limites (null = sem limite). */
  planName: string | null;
  maxProducts: number | null;
  /** Pessoas no painel, contando o dono (null = sem limite). */
  maxUsers: number | null;
  nfeIncluded: boolean;
  customDomainIncluded: boolean;
  /**
   * Comissão por venda do plano, em pontos-base (200 = 2%). Vale também no
   * teste grátis: o teste libera recursos, não isenta a venda.
   */
  feeBps: number;
  /** true enquanto a loja está no teste grátis: recursos liberados. */
  trial: boolean;
};

const SEM_LIMITE: Omit<PlanLimits, 'trial' | 'feeBps'> = {
  planName: null,
  maxProducts: null,
  maxUsers: null,
  nfeIncluded: true,
  customDomainIncluded: true,
};

/**
 * Store.planName guardou coisas diferentes ao longo do tempo: o nome do plano
 * no signup ("Essencial"), o id depois do pagamento ("plan-seed-essencial") e,
 * antes da tabela de planos, o id do catálogo fixo ("essencial", "mensal",
 * "pro"; ou o nome antigo "Mensal"/"Pro"). Este mapa leva esses valores,
 * sem diferenciar maiúscula, para as linhas-semente.
 */
export const IDS_ANTIGOS: Record<string, string> = {
  essencial: 'plan-seed-essencial',
  mensal: 'plan-seed-mensal',
  pro: 'plan-seed-pro',
  comeco: 'plan-seed-comeco',
};

/**
 * Diz o que o plano de uma loja permite, e barra quando passa do limite.
 *
 * Teste grátis libera tudo, para o lojista experimentar a plataforma
 * inteira. Plano que não é encontrado (apagado, texto antigo) também libera:
 * na dúvida, não bloquear quem está pagando.
 */
@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger(PlanLimitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async forStore(storeId: string): Promise<PlanLimits> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { status: true, planName: true },
    });
    if (!store) return { ...SEM_LIMITE, feeBps: 0, trial: false };

    const plan = await this.findPlan(store.planName);
    const feeBps = plan?.feeBps ?? 0;
    if (store.status === StoreStatus.TRIAL) {
      return { ...SEM_LIMITE, feeBps, trial: true };
    }

    if (!plan) {
      if (store.planName) {
        this.logger.warn(
          `Plano "${store.planName}" da loja ${storeId} não encontrado; sem limites.`,
        );
      }
      return { ...SEM_LIMITE, feeBps: 0, trial: false };
    }
    return {
      planName: plan.name,
      maxProducts: plan.maxProducts ?? null,
      maxUsers: plan.maxUsers ?? null,
      nfeIncluded: plan.nfeIncluded ?? true,
      customDomainIncluded: plan.customDomainIncluded ?? true,
      feeBps,
      trial: false,
    };
  }

  /** Lança 403 se a loja já está no máximo de produtos do plano. */
  async assertCanCreateProduct(storeId: string) {
    const limits = await this.forStore(storeId);
    if (limits.maxProducts == null) return;
    const count = await this.prisma.product.count({ where: { storeId } });
    if (count >= limits.maxProducts) {
      throw new ForbiddenException(
        `O plano ${limits.planName} permite até ${limits.maxProducts} produtos. Para cadastrar mais, mude de plano em Configurações → Planos.`,
      );
    }
  }

  /** Lança 403 se a loja já tem todas as pessoas que o plano permite. */
  async assertCanAddTeamMember(storeId: string) {
    const limits = await this.forStore(storeId);
    if (limits.maxUsers == null) return;
    const count = await this.prisma.user.count({
      where: { storeId, role: 'STORE_ADMIN', active: true },
    });
    if (count >= limits.maxUsers) {
      throw new ForbiddenException(
        limits.maxUsers <= 1
          ? `O plano ${limits.planName} é só para o dono da loja. Para chamar sua equipe, mude de plano em Configurações → Planos.`
          : `O plano ${limits.planName} permite até ${limits.maxUsers} pessoas no painel, contando você. Desative alguém ou mude de plano em Configurações → Planos.`,
      );
    }
  }

  /** Lança 403 se o plano da loja não inclui nota fiscal. */
  async assertNfeIncluded(storeId: string) {
    const limits = await this.forStore(storeId);
    if (!limits.nfeIncluded) {
      throw new ForbiddenException(
        `Nota fiscal não faz parte do plano ${limits.planName}. Mude de plano em Configurações → Planos para emitir NF-e.`,
      );
    }
  }

  /** Lança 403 se o plano da loja não permite domínio próprio. */
  async assertCustomDomainIncluded(storeId: string) {
    const limits = await this.forStore(storeId);
    if (!limits.customDomainIncluded) {
      throw new ForbiddenException(
        `Domínio próprio não faz parte do plano ${limits.planName}. Mude de plano em Configurações → Planos para usar www.sualoja.com.br.`,
      );
    }
  }

  /**
   * Taxa por venda de várias lojas com uma consulta só ao catálogo (para
   * relatórios). Mesma regra do forStore: plano não encontrado = sem taxa.
   */
  async taxaPorPlano(): Promise<(planName: string | null) => number> {
    const catalog = await this.carregarCatalogo();
    return (planName) => this.acharNoCatalogo(catalog, planName)?.feeBps ?? 0;
  }

  private async findPlan(planName: string | null) {
    if (!planName?.trim()) return null;
    return this.acharNoCatalogo(await this.carregarCatalogo(), planName);
  }

  private async carregarCatalogo() {
    const rows = await this.prisma.platformPlan.findMany({
      select: {
        id: true,
        name: true,
        periodDays: true,
        maxProducts: true,
        maxUsers: true,
        nfeIncluded: true,
        feeBps: true,
        customDomainIncluded: true,
      },
    });
    return rows.length > 0 ? rows : DEFAULT_PLATFORM_PLANS;
  }

  private acharNoCatalogo(
    catalog: Awaited<ReturnType<PlanLimitsService['carregarCatalogo']>>,
    planName: string | null,
  ) {
    const key = planName?.trim();
    if (!key) return null;
    const id = IDS_ANTIGOS[key.toLowerCase()] ?? key;
    const byId = catalog.find((p) => p.id === id || p.id === key);
    if (byId) return byId;

    // Signup antigo gravava o nome. Nome repete entre mensal e anual, mas os
    // dois têm os mesmos limites; prefere o mensal só para ser determinístico.
    const lower = key.toLowerCase();
    const byName = catalog
      .filter((p) => p.name.toLowerCase() === lower)
      .sort((a, b) => a.periodDays - b.periodDays);
    return byName[0] ?? null;
  }
}
