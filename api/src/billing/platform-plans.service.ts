import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IDS_ANTIGOS } from '../plan-limits/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlatformPlanDto,
  UpdatePlatformPlanDto,
} from './dto/platform-plan.dto';
import { DEFAULT_PLATFORM_PLANS, type PlatformPlan } from './platform-plans';

/**
 * Planos da mensalidade, editáveis pelo Super Admin (nome, preço, destaque,
 * recursos). Antes eram fixos em código/env — trocar preço exigia deploy.
 */
@Injectable()
export class PlatformPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: {
    id: string;
    name: string;
    description: string | null;
    amount: Prisma.Decimal;
    periodDays: number;
    badge: string | null;
    highlight: boolean;
    features: Prisma.JsonValue;
    maxProducts: number | null;
    maxUsers: number | null;
    nfeIncluded: boolean;
    feeBps: number;
    customDomainIncluded: boolean;
  }): PlatformPlan {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      amount: Number(row.amount),
      periodDays: row.periodDays,
      highlight: row.highlight,
      badge: row.badge || undefined,
      features: Array.isArray(row.features)
        ? (row.features as string[])
        : undefined,
      maxProducts: row.maxProducts,
      maxUsers: row.maxUsers,
      nfeIncluded: row.nfeIncluded,
      feeBps: row.feeBps,
      customDomainIncluded: row.customDomainIncluded,
    };
  }

  /** Só os ativos, na ordem que o Super Admin definiu — o que aparece no signup e no checkout de assinatura. */
  async listActive(): Promise<PlatformPlan[]> {
    const rows = await this.prisma.platformPlan.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
    // Tabela vazia não deveria acontecer (a migration semeia 3 planos), mas
    // sem isso um signup ficaria sem nenhum plano pra referenciar.
    if (rows.length === 0) return DEFAULT_PLATFORM_PLANS;
    return rows.map((r) => this.toDto(r));
  }

  /** Todos, incluindo desativados — tela de gestão do Super Admin. */
  async listAll() {
    const rows = await this.prisma.platformPlan.findMany({
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => ({ ...this.toDto(r), active: r.active }));
  }

  /** Guarda quem mudou o quê — preço e taxa mexem no dinheiro de todo mundo. */
  private async registrarAlteracao(
    planId: string,
    changedById: string | undefined,
    changes: Record<string, unknown>,
  ) {
    await this.prisma.platformPlanChange.create({
      data: {
        planId,
        changedById: changedById ?? null,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  async create(dto: CreatePlatformPlanDto, changedById?: string) {
    const maxOrder = await this.prisma.platformPlan.aggregate({
      _max: { order: true },
    });
    const row = await this.prisma.platformPlan.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        amount: new Prisma.Decimal(dto.amount),
        periodDays: dto.periodDays ?? 30,
        badge: dto.badge?.trim() || null,
        highlight: dto.highlight ?? false,
        features: dto.features?.length ? dto.features : undefined,
        maxProducts: dto.maxProducts || null,
        maxUsers: dto.maxUsers || null,
        nfeIncluded: dto.nfeIncluded ?? true,
        feeBps: dto.feeBps ?? 0,
        customDomainIncluded: dto.customDomainIncluded ?? true,
        order: dto.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
    await this.registrarAlteracao(row.id, changedById, { criado: dto });
    return { ...this.toDto(row), active: row.active };
  }

  async update(id: string, dto: UpdatePlatformPlanDto, changedById?: string) {
    const existing = await this.prisma.platformPlan.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Plano não encontrado');

    const row = await this.prisma.platformPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.amount !== undefined
          ? { amount: new Prisma.Decimal(dto.amount) }
          : {}),
        ...(dto.periodDays !== undefined ? { periodDays: dto.periodDays } : {}),
        ...(dto.badge !== undefined
          ? { badge: dto.badge?.trim() || null }
          : {}),
        ...(dto.highlight !== undefined ? { highlight: dto.highlight } : {}),
        ...(dto.features !== undefined
          ? { features: dto.features.length ? dto.features : Prisma.JsonNull }
          : {}),
        // 0 ou null = sem limite
        ...(dto.maxProducts !== undefined
          ? { maxProducts: dto.maxProducts || null }
          : {}),
        ...(dto.maxUsers !== undefined
          ? { maxUsers: dto.maxUsers || null }
          : {}),
        ...(dto.nfeIncluded !== undefined
          ? { nfeIncluded: dto.nfeIncluded }
          : {}),
        ...(dto.feeBps !== undefined ? { feeBps: dto.feeBps } : {}),
        ...(dto.customDomainIncluded !== undefined
          ? { customDomainIncluded: dto.customDomainIncluded }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    const antes = existing as unknown as Record<string, unknown>;
    const depois = row as unknown as Record<string, unknown>;
    const mudou: Record<string, { de: unknown; para: unknown }> = {};
    for (const campo of Object.keys(dto)) {
      if (JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo])) {
        mudou[campo] = { de: antes[campo], para: depois[campo] };
      }
    }
    if (Object.keys(mudou).length > 0) {
      await this.registrarAlteracao(id, changedById, mudou);
    }
    return { ...this.toDto(row), active: row.active };
  }

  /**
   * Apaga um plano que ninguém usa.
   *
   * A loja guarda o id do plano e é por ele que a taxa por venda e os limites
   * são achados: apagar um plano em uso deixaria essas lojas sem taxa e sem
   * limite, em silêncio. Plano em uso se desativa (some da lista de escolha,
   * quem usa continua).
   */
  async remove(id: string, changedById?: string) {
    const existing = await this.prisma.platformPlan.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Plano não encontrado');

    const apelidos = Object.entries(IDS_ANTIGOS)
      .filter(([, alvo]) => alvo === id)
      .map(([antigo]) => antigo);
    const emUso = await this.prisma.store.count({
      where: {
        OR: [
          { planName: id },
          { planName: { equals: existing.name, mode: 'insensitive' } },
          ...apelidos.map((a) => ({
            planName: { equals: a, mode: 'insensitive' as const },
          })),
        ],
      },
    });
    if (emUso > 0) {
      throw new BadRequestException(
        `${emUso} loja${emUso === 1 ? ' usa' : 's usam'} este plano. Desative em vez de apagar: ele some da lista para quem for contratar e quem já usa continua normalmente.`,
      );
    }

    await this.prisma.platformPlan.delete({ where: { id } });
    await this.registrarAlteracao(id, changedById, {
      apagado: { ...existing, amount: Number(existing.amount) },
    });
    return { ok: true };
  }
}
