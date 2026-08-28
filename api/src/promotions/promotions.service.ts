import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string) {
    return this.prisma.promotion.findMany({
      where: { storeId },
      include: {
        product: {
          include: { images: { orderBy: { position: 'asc' }, take: 1 } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(storeId: string, dto: CreatePromotionDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, storeId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const compareAt =
      dto.compareAt !== undefined
        ? new Prisma.Decimal(dto.compareAt)
        : (product.compareAt ?? product.price);
    const promoPrice = new Prisma.Decimal(dto.promoPrice);

    if (promoPrice.greaterThanOrEqualTo(compareAt)) {
      throw new BadRequestException(
        'Preço promocional deve ser menor que o preço “de”',
      );
    }

    const existing = await this.prisma.promotion.findUnique({
      where: {
        storeId_productId: { storeId, productId: product.id },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Este produto já tem promoção. Edite ou remova a existente.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          price: promoPrice,
          compareAt,
        },
      });

      return tx.promotion.create({
        data: {
          storeId,
          productId: product.id,
          title: dto.title || `Promo ${product.name}`,
          active: dto.active ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: {
          product: {
            include: { images: { orderBy: { position: 'asc' }, take: 1 } },
          },
        },
      });
    });
  }

  async update(storeId: string, id: string, dto: UpdatePromotionDto) {
    const promo = await this.ensure(storeId, id);
    const product = await this.prisma.product.findFirst({
      where: { id: promo.productId, storeId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const nextPrice =
      dto.promoPrice !== undefined
        ? new Prisma.Decimal(dto.promoPrice)
        : product.price;
    const nextCompare =
      dto.compareAt !== undefined
        ? new Prisma.Decimal(dto.compareAt)
        : (product.compareAt ?? product.price);

    if (
      (dto.promoPrice !== undefined || dto.compareAt !== undefined) &&
      nextPrice.greaterThanOrEqualTo(nextCompare)
    ) {
      throw new BadRequestException(
        'Preço promocional deve ser menor que o preço “de”',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.promoPrice !== undefined || dto.compareAt !== undefined) {
        await tx.product.update({
          where: { id: product.id },
          data: {
            ...(dto.promoPrice !== undefined ? { price: nextPrice } : {}),
            ...(dto.compareAt !== undefined
              ? { compareAt: nextCompare }
              : dto.promoPrice !== undefined
                ? { compareAt: nextCompare }
                : {}),
          },
        });
      }

      return tx.promotion.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
            : {}),
          ...(dto.endsAt !== undefined
            ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
            : {}),
        },
        include: {
          product: {
            include: { images: { orderBy: { position: 'asc' }, take: 1 } },
          },
        },
      });
    });
  }

  async remove(storeId: string, id: string) {
    const promo = await this.ensure(storeId, id);
    const product = await this.prisma.product.findFirst({
      where: { id: promo.productId, storeId },
    });

    await this.prisma.$transaction(async (tx) => {
      if (product?.compareAt) {
        await tx.product.update({
          where: { id: product.id },
          data: {
            price: product.compareAt,
            compareAt: null,
          },
        });
      }
      await tx.promotion.delete({ where: { id } });
    });

    return { ok: true };
  }

  private async ensure(storeId: string, id: string) {
    const promo = await this.prisma.promotion.findFirst({
      where: { id, storeId },
    });
    if (!promo) throw new NotFoundException('Promoção não encontrada');
    return promo;
  }
}
