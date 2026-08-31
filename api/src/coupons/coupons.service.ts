import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, DiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto/coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string) {
    return this.prisma.coupon.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(storeId: string, dto: CreateCouponDto) {
    const value =
      dto.type === DiscountType.FREE_SHIPPING ? 0 : Number(dto.value ?? 0);
    this.assertValue(dto.type, value);
    const code = this.normalizeCode(dto.code);
    try {
      return await this.prisma.coupon.create({
        data: {
          storeId,
          code,
          description: dto.description,
          type: dto.type,
          value: new Prisma.Decimal(value),
          minSubtotal:
            dto.minSubtotal !== undefined
              ? new Prisma.Decimal(dto.minSubtotal)
              : undefined,
          maxUses: dto.maxUses,
          maxPerCustomer: dto.maxPerCustomer,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          active: dto.active ?? true,
          showOnStorefront: dto.showOnStorefront ?? false,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Já existe um cupom com esse código');
      }
      throw err;
    }
  }

  async update(storeId: string, id: string, dto: UpdateCouponDto) {
    const coupon = await this.ensure(storeId, id);
    const type = dto.type ?? coupon.type;
    const value =
      type === DiscountType.FREE_SHIPPING
        ? 0
        : (dto.value ?? Number(coupon.value));
    this.assertValue(type, value);

    try {
      return await this.prisma.coupon.update({
        where: { id },
        data: {
          ...(dto.code ? { code: this.normalizeCode(dto.code) } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.type ? { type: dto.type } : {}),
          value: new Prisma.Decimal(value),
          ...(dto.minSubtotal !== undefined
            ? {
                minSubtotal:
                  dto.minSubtotal === null
                    ? null
                    : new Prisma.Decimal(dto.minSubtotal),
              }
            : {}),
          ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
          ...(dto.maxPerCustomer !== undefined
            ? { maxPerCustomer: dto.maxPerCustomer }
            : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
            : {}),
          ...(dto.endsAt !== undefined
            ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.showOnStorefront !== undefined
            ? { showOnStorefront: dto.showOnStorefront }
            : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Já existe um cupom com esse código');
      }
      throw err;
    }
  }

  async remove(storeId: string, id: string) {
    await this.ensure(storeId, id);
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true };
  }

  async validate(storeId: string, dto: ValidateCouponDto) {
    const coupon = await this.findActiveByCode(storeId, dto.code);
    this.ensureMinSubtotal(coupon, dto.subtotal);
    const freeShipping = coupon.type === DiscountType.FREE_SHIPPING;
    const discount = freeShipping
      ? new Prisma.Decimal(0)
      : this.computeDiscount(coupon, dto.subtotal);
    const shippingDiscount = freeShipping
      ? new Prisma.Decimal(dto.shippingCost ?? 0)
      : new Prisma.Decimal(0);

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      freeShipping,
      shippingDiscount,
      description: coupon.description,
    };
  }

  async applyToSubtotal(storeId: string, code: string, subtotal: number) {
    const coupon = await this.findActiveByCode(storeId, code);
    this.ensureMinSubtotal(coupon, subtotal);
    const freeShipping = coupon.type === DiscountType.FREE_SHIPPING;
    const discount = freeShipping
      ? new Prisma.Decimal(0)
      : this.computeDiscount(coupon, subtotal);
    return { coupon, discount, freeShipping };
  }

  /**
   * Reserva um uso do cupom. Compare-and-swap: só incrementa se ainda houver
   * saldo, então N pedidos simultâneos não furam o limite. Devolve false
   * quando o cupom esgotou entre a validação e a reserva.
   */
  async reserveUsage(tx: Prisma.TransactionClient, couponId: string) {
    const res = await tx.coupon.updateMany({
      where: {
        id: couponId,
        OR: [
          { maxUses: null },
          { usedCount: { lt: this.prisma.coupon.fields.maxUses } },
        ],
      },
      data: { usedCount: { increment: 1 } },
    });
    return res.count === 1;
  }

  /** Devolve o uso quando o pedido é cancelado, expira ou é estornado. */
  async releaseUsage(couponId: string) {
    await this.prisma.coupon.updateMany({
      where: { id: couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }

  /**
   * Quantas vezes este cliente já usou o cupom. Pedido cancelado não conta —
   * senão desistir de uma compra queimaria o direito ao desconto.
   */
  async usageByCustomer(couponId: string, customerId: string) {
    return this.prisma.order.count({
      where: {
        couponId,
        customerId,
        status: { not: 'CANCELLED' },
      },
    });
  }

  /** Cupom que o lojista escolheu mostrar num banner na vitrine (ou nenhum). */
  async findStorefrontBanner(storeId: string) {
    const now = new Date();
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        storeId,
        active: true,
        showOnStorefront: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!coupon) return null;
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return null;
    }
    return {
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
    };
  }

  private async findActiveByCode(storeId: string, rawCode: string) {
    const code = this.normalizeCode(rawCode);
    const coupon = await this.prisma.coupon.findUnique({
      where: { storeId_code: { storeId, code } },
    });
    if (!coupon || !coupon.active) {
      throw new BadRequestException('Cupom inválido ou inativo');
    }
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('Cupom ainda não está válido');
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      throw new BadRequestException('Cupom vencido');
    }
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Cupom esgotado');
    }
    return coupon;
  }

  private ensureMinSubtotal(coupon: Coupon, subtotal: number) {
    const sub = new Prisma.Decimal(subtotal);
    if (coupon.minSubtotal && sub.lessThan(coupon.minSubtotal)) {
      throw new BadRequestException(
        `Pedido mínimo de R$ ${Number(coupon.minSubtotal).toFixed(2)} para este cupom`,
      );
    }
  }

  computeDiscount(coupon: Coupon, subtotal: number) {
    if (coupon.type === DiscountType.FREE_SHIPPING) {
      return new Prisma.Decimal(0);
    }

    const sub = new Prisma.Decimal(subtotal);
    this.ensureMinSubtotal(coupon, subtotal);

    let discount =
      coupon.type === DiscountType.PERCENT
        ? sub.mul(coupon.value).div(100)
        : coupon.value;

    if (discount.greaterThan(sub)) {
      discount = sub;
    }
    if (discount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Cupom sem desconto aplicável');
    }
    return discount.toDecimalPlaces(2);
  }

  private assertValue(type: DiscountType, value: number) {
    if (type === DiscountType.FREE_SHIPPING) return;
    if (type === DiscountType.PERCENT && (value <= 0 || value > 100)) {
      throw new BadRequestException('Percentual deve ser entre 0.01 e 100');
    }
    if (type === DiscountType.FIXED && value <= 0) {
      throw new BadRequestException('Valor do cupom deve ser maior que zero');
    }
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private async ensure(storeId: string, id: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id, storeId },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    return coupon;
  }
}
