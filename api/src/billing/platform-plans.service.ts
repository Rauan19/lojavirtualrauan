import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async create(dto: CreatePlatformPlanDto) {
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
        order: dto.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
    return { ...this.toDto(row), active: row.active };
  }

  async update(id: string, dto: UpdatePlatformPlanDto) {
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
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    return { ...this.toDto(row), active: row.active };
  }

  async remove(id: string) {
    const existing = await this.prisma.platformPlan.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Plano não encontrado');
    // Store.planName é só um texto salvo na hora — apagar o plano não quebra
    // loja que já usa esse nome, só tira da lista de escolha.
    await this.prisma.platformPlan.delete({ where: { id } });
    return { ok: true };
  }
}
