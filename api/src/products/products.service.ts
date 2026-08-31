import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StoreType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { categoriesForStoreType } from '../stores/store-type';
import {
  CreateCategoryDto,
  CreateProductDto,
  ProductQueryDto,
  ProductVariantInputDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';

const productInclude = {
  images: { orderBy: { position: 'asc' as const } },
  category: true,
  variants: { orderBy: { position: 'asc' as const } },
  _count: { select: { orderItems: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultCategories(storeId: string, storeType?: StoreType) {
    const count = await this.prisma.category.count({ where: { storeId } });
    if (count > 0) return;

    let type = storeType;
    if (!type) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { storeType: true },
      });
      type = store?.storeType ?? StoreType.GENERAL;
    }

    const categories = categoriesForStoreType(type);
    await this.prisma.category.createMany({
      data: categories.map((c) => ({
        storeId,
        name: c.name,
        slug: c.slug,
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  async createCategory(storeId: string, dto: CreateCategoryDto) {
    const slug = slugify(dto.slug || dto.name);
    const parentId = await this.resolveParentId(storeId, dto.parentId);
    return this.prisma.category.create({
      data: {
        storeId,
        name: dto.name,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        borderColor: dto.borderColor?.trim() || null,
        parentId,
      },
    });
  }

  /*
   * A vitrine trabalha com dois níveis (departamento > subcategoria), então o
   * pai precisa ser sempre um departamento e uma categoria que já tem filhas
   * não pode virar filha de ninguém. Isso mantém o mega-menu previsível e
   * elimina a chance de ciclo na árvore.
   */
  private async resolveParentId(
    storeId: string,
    raw: string | undefined,
    selfId?: string,
  ): Promise<string | null | undefined> {
    if (raw === undefined) return undefined;
    const parentId = raw.trim();
    if (!parentId) return null;
    if (selfId && parentId === selfId) {
      throw new BadRequestException(
        'Uma categoria não pode ser subcategoria dela mesma',
      );
    }
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, storeId },
    });
    if (!parent) {
      throw new NotFoundException('Categoria pai não encontrada');
    }
    if (parent.parentId) {
      throw new BadRequestException(
        `"${parent.name}" já é uma subcategoria. Escolha um departamento principal.`,
      );
    }
    if (selfId) {
      const children = await this.prisma.category.count({
        where: { storeId, parentId: selfId },
      });
      if (children > 0) {
        throw new BadRequestException(
          'Esta categoria já tem subcategorias. Mova-as antes de transformá-la em subcategoria.',
        );
      }
    }
    return parentId;
  }

  async listCategories(storeId: string, activeOnly = false) {
    await this.ensureDefaultCategories(storeId);
    return this.prisma.category.findMany({
      where: {
        storeId,
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateCategory(storeId: string, id: string, dto: UpdateCategoryDto) {
    await this.ensureCategory(storeId, id);
    const { parentId: rawParentId, borderColor, ...rest } = dto;
    const parentId = await this.resolveParentId(storeId, rawParentId, id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...rest,
        // string vazia limpa a cor e devolve o anel à cor da loja
        ...(borderColor !== undefined
          ? { borderColor: borderColor.trim() || null }
          : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(dto.name ? { slug: slugify(dto.name) } : {}),
      },
    });
  }

  async removeCategory(storeId: string, id: string) {
    await this.ensureCategory(storeId, id);
    const children = await this.prisma.category.count({
      where: { storeId, parentId: id },
    });
    if (children > 0) {
      throw new BadRequestException(
        'Remova ou mova as subcategorias antes de excluir este departamento',
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  async createProduct(storeId: string, dto: CreateProductDto) {
    if (!dto.categoryId?.trim()) {
      throw new BadRequestException('Selecione uma categoria');
    }
    await this.ensureCategory(storeId, dto.categoryId);

    const imageUrls = (dto.imageUrls || []).slice(0, 6);
    if (dto.compareAt !== undefined && dto.compareAt <= dto.price) {
      throw new BadRequestException(
        'Preço “de” (compareAt) deve ser maior que o preço “por”',
      );
    }

    const slug = await this.uniqueProductSlug(
      storeId,
      slugify(dto.slug || dto.name),
    );

    const variants = dto.variants?.length ? dto.variants : undefined;
    const hasVariants = Boolean(variants?.length);
    const stock = hasVariants
      ? variants!.reduce((sum, v) => sum + (v.stock ?? 0), 0)
      : (dto.stock ?? 0);

    return this.prisma.product.create({
      data: {
        storeId,
        name: dto.name,
        slug,
        description: dto.description,
        sku: dto.sku,
        brand: dto.brand,
        categoryId: dto.categoryId,
        price: new Prisma.Decimal(dto.price),
        compareAt:
          dto.compareAt !== undefined
            ? new Prisma.Decimal(dto.compareAt)
            : undefined,
        installments:
          dto.installments !== undefined
            ? Math.min(12, Math.max(2, Math.floor(dto.installments)))
            : undefined,
        stock,
        hasVariants,
        ncm: dto.ncm?.replace(/\D/g, '').slice(0, 8) || undefined,
        unit: dto.unit?.trim() || undefined,
        active: dto.active ?? true,
        featured: dto.featured ?? false,
        attributes: (dto.attributes as Prisma.InputJsonValue) ?? undefined,
        weightKg:
          dto.weightKg !== undefined
            ? new Prisma.Decimal(dto.weightKg)
            : undefined,
        widthCm:
          dto.widthCm !== undefined
            ? new Prisma.Decimal(dto.widthCm)
            : undefined,
        heightCm:
          dto.heightCm !== undefined
            ? new Prisma.Decimal(dto.heightCm)
            : undefined,
        lengthCm:
          dto.lengthCm !== undefined
            ? new Prisma.Decimal(dto.lengthCm)
            : undefined,
        images: imageUrls.length
          ? {
              create: imageUrls.map((url, position) => ({
                url,
                position,
              })),
            }
          : undefined,
        variants: variants
          ? {
              create: variants.map((v, i) => this.variantCreateData(v, i)),
            }
          : undefined,
      },
      include: productInclude,
    });
  }

  /**
   * Ids que um filtro de categoria deve alcançar: a própria e as filhas.
   *
   * Sem isso, clicar num departamento cujos produtos estão nas subcategorias
   * devolvia lista vazia — a árvore aparecia no menu e não filtrava nada.
   */
  private async categoriaComFilhas(storeId: string, categoryId: string) {
    const filhas = await this.prisma.category.findMany({
      where: { storeId, parentId: categoryId },
      select: { id: true },
    });
    return [categoryId, ...filhas.map((f) => f.id)];
  }

  async listProducts(
    storeId: string,
    query: ProductQueryDto,
    publicOnly = false,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const categoriaIds = query.categoryId
      ? await this.categoriaComFilhas(storeId, query.categoryId)
      : null;
    const where: Prisma.ProductWhereInput = {
      storeId,
      ...(publicOnly ? { active: true } : {}),
      ...(categoriaIds ? { categoryId: { in: categoriaIds } } : {}),
      ...(query.active !== undefined && !publicOnly
        ? { active: query.active === 'true' }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { brand: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.minPrice != null || query.maxPrice != null
        ? {
            price: {
              ...(query.minPrice != null ? { gte: query.minPrice } : {}),
              ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.inStock === 'true' ? { stock: { gt: 0 } } : {}),
      // Aproximação: compareAt só é preenchido pelo lojista quando o
      // produto está em promoção (o "de/por"), então usamos isso como
      // proxy pra "com desconto" sem comparar duas colunas no SQL.
      ...(query.onSale === 'true' ? { compareAt: { not: null } } : {}),
      ...(query.featured === 'true' ? { featured: true } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : query.sort === 'name_asc'
            ? { name: 'asc' }
            : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const ratingByProduct = await this.ratingsFor(items.map((p) => p.id));
    const itemsWithRating = items.map((p) => ({
      ...p,
      rating: ratingByProduct.get(p.id) || null,
    }));

    return {
      items: itemsWithRating,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Média + contagem de reviews por produto, num só round-trip. */
  private async ratingsFor(productIds: string[]) {
    const map = new Map<string, { avg: number; count: number }>();
    if (!productIds.length) return map;
    const rows = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    for (const row of rows) {
      map.set(row.productId, {
        avg: Number(row._avg.rating ?? 0),
        count: row._count.rating,
      });
    }
    return map;
  }

  async getProduct(storeId: string, idOrSlug: string, publicOnly = false) {
    const product = await this.prisma.product.findFirst({
      where: {
        storeId,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        ...(publicOnly ? { active: true } : {}),
      },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const ratingByProduct = await this.ratingsFor([product.id]);
    return { ...product, rating: ratingByProduct.get(product.id) || null };
  }

  async listReviews(storeId: string, idOrSlug: string, page = 1, limit = 10) {
    const product = await this.prisma.product.findFirst({
      where: { storeId, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const safePage = page > 0 ? page : 1;
    const safeLimit = limit > 0 ? Math.min(limit, 50) : 10;
    const where = { productId: product.id, hidden: false };

    const [items, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        customerName: r.customer.name,
        verifiedPurchase: r.verifiedPurchase,
      })),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      avgRating: Number(agg._avg.rating ?? 0),
    };
  }

  async createReview(
    storeId: string,
    customerId: string,
    dto: { productId: string; rating: number; comment?: string },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { storeId, id: dto.productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const rating = Math.round(dto.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Nota deve ser de 1 a 5');
    }

    const purchase = await this.prisma.orderItem.findFirst({
      where: {
        productId: product.id,
        order: {
          storeId,
          customerId,
          paymentStatus: 'APPROVED',
        },
      },
      select: { id: true },
    });

    try {
      return await this.prisma.review.create({
        data: {
          storeId,
          productId: product.id,
          customerId,
          rating,
          comment: dto.comment?.trim() || undefined,
          verifiedPurchase: Boolean(purchase),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException('Você já avaliou este produto');
      }
      throw err;
    }
  }

  async listReviewsAdmin(storeId: string, page = 1, limit = 20) {
    const safePage = page > 0 ? page : 1;
    const safeLimit = limit > 0 ? Math.min(limit, 100) : 20;

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { storeId },
        include: {
          customer: { select: { name: true, email: true } },
          product: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.review.count({ where: { storeId } }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async setReviewHidden(storeId: string, reviewId: string, hidden: boolean) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, storeId },
    });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { hidden },
    });
  }

  async deleteReview(storeId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, storeId },
    });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    await this.prisma.review.delete({ where: { id: reviewId } });
    return { ok: true };
  }

  async listBrands(storeId: string) {
    const rows = await this.prisma.product.findMany({
      where: { storeId, active: true, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });
    return rows
      .map((r) => r.brand)
      .filter((b): b is string => !!b && b.trim().length > 0);
  }

  async updateProduct(storeId: string, id: string, dto: UpdateProductDto) {
    await this.ensureProduct(storeId, id);
    if (dto.categoryId) {
      await this.ensureCategory(storeId, dto.categoryId);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.variants !== undefined) {
        await this.syncVariants(tx, id, dto.variants);
      }

      const variants = await tx.productVariant.findMany({
        where: { productId: id },
        select: { stock: true },
      });
      const hasVariants = variants.length > 0;
      const stockFromVariants = variants.reduce((s, v) => s + v.stock, 0);

      return tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          sku: dto.sku,
          brand: dto.brand,
          categoryId: dto.categoryId,
          price:
            dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
          compareAt:
            dto.compareAt !== undefined
              ? new Prisma.Decimal(dto.compareAt)
              : undefined,
          installments:
            dto.installments === null
              ? null
              : dto.installments !== undefined
                ? Math.min(12, Math.max(2, Math.floor(dto.installments)))
                : undefined,
          stock: hasVariants
            ? stockFromVariants
            : dto.stock !== undefined
              ? dto.stock
              : undefined,
          hasVariants,
          ncm:
            dto.ncm === null
              ? null
              : dto.ncm !== undefined
                ? dto.ncm.replace(/\D/g, '').slice(0, 8) || null
                : undefined,
          unit: dto.unit !== undefined ? dto.unit.trim() || 'UN' : undefined,
          active: dto.active,
          featured: dto.featured,
          attributes: dto.attributes as Prisma.InputJsonValue | undefined,
          weightKg:
            dto.weightKg === null
              ? null
              : dto.weightKg !== undefined
                ? new Prisma.Decimal(dto.weightKg)
                : undefined,
          widthCm:
            dto.widthCm === null
              ? null
              : dto.widthCm !== undefined
                ? new Prisma.Decimal(dto.widthCm)
                : undefined,
          heightCm:
            dto.heightCm === null
              ? null
              : dto.heightCm !== undefined
                ? new Prisma.Decimal(dto.heightCm)
                : undefined,
          lengthCm:
            dto.lengthCm === null
              ? null
              : dto.lengthCm !== undefined
                ? new Prisma.Decimal(dto.lengthCm)
                : undefined,
          ...(dto.name ? { slug: slugify(dto.name) } : {}),
        },
        include: productInclude,
      });
    });
  }

  async addImages(storeId: string, productId: string, urls: string[]) {
    await this.ensureProduct(storeId, productId);
    const existing = await this.prisma.productImage.count({
      where: { productId },
    });
    const room = Math.max(0, 6 - existing);
    if (room === 0) {
      throw new BadRequestException('Produto já tem o máximo de 6 fotos');
    }
    const toAdd = urls.slice(0, room);
    const last = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { position: 'desc' },
    });
    let position = (last?.position ?? -1) + 1;

    await this.prisma.productImage.createMany({
      data: toAdd.map((url) => ({
        productId,
        url,
        position: position++,
      })),
    });

    return this.getProduct(storeId, productId);
  }

  async removeProduct(storeId: string, id: string) {
    await this.ensureProduct(storeId, id);
    const sold = await this.prisma.orderItem.count({
      where: { productId: id },
    });
    if (sold > 0) {
      throw new BadRequestException(
        'Este produto já teve pedidos. Desative-o na vitrine em vez de excluir.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  private variantCreateData(v: ProductVariantInputDto, index: number) {
    return {
      sku: v.sku?.trim() || null,
      barcode: v.barcode?.trim() || null,
      label: v.label,
      options: v.options as Prisma.InputJsonValue,
      price:
        v.price !== undefined && v.price !== null
          ? new Prisma.Decimal(v.price)
          : null,
      compareAt:
        v.compareAt !== undefined && v.compareAt !== null
          ? new Prisma.Decimal(v.compareAt)
          : null,
      stock: v.stock ?? 0,
      imageUrl: v.imageUrl?.trim() || null,
      active: v.active ?? true,
      position: v.position ?? index,
    };
  }

  private async syncVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    variants: ProductVariantInputDto[],
  ) {
    const existing = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    const keepIds = new Set(
      variants.filter((v) => v.id).map((v) => v.id as string),
    );

    const toDelete = existing
      .filter((e) => !keepIds.has(e.id))
      .map((e) => e.id);
    if (toDelete.length) {
      await tx.productVariant.deleteMany({
        where: { id: { in: toDelete }, productId },
      });
    }

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const data = this.variantCreateData(v, i);
      if (v.id && keepIds.has(v.id)) {
        const owned = existing.some((e) => e.id === v.id);
        if (!owned) {
          throw new BadRequestException(`Variante inválida: ${v.id}`);
        }
        await tx.productVariant.update({
          where: { id: v.id },
          data,
        });
      } else {
        await tx.productVariant.create({
          data: { productId, ...data },
        });
      }
    }
  }

  private async uniqueProductSlug(storeId: string, base: string) {
    const root = (base || 'produto').slice(0, 70);
    let candidate = root;
    let n = 2;

    while (n < 1000) {
      const exists = await this.prisma.product.findFirst({
        where: { storeId, slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      candidate = `${root}-${n}`;
      n += 1;
    }

    return `${root}-${Date.now()}`;
  }

  private async ensureProduct(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, storeId },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  private async ensureCategory(storeId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, storeId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }
}
