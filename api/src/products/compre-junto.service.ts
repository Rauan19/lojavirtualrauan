import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  descontoDoComboCents,
  MAX_DESCONTO_COMBO_PCT,
  type RegraDeCombo,
} from './combo';

/** Mais que isso vira vitrine, não sugestão: o cliente para de olhar. */
export const MAX_COMPRE_JUNTO = 3;

/**
 * "Compre junto": o lojista escolhe até 3 produtos que combinam com este
 * (a capinha do celular, o cinto da calça) e a página do produto oferece
 * levar tudo num clique, com um desconto opcional nos sugeridos. O desconto
 * é sempre recalculado no servidor, a partir dos preços do banco.
 */
@Injectable()
export class CompreJuntoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Painel: os escolhidos, inclusive inativos (para o lojista ver e trocar). */
  async doPainel(storeId: string, productId: string) {
    const produto = await this.produto(storeId, productId);
    const itens = await this.buscar(storeId, produto.buyTogetherIds, false);
    return {
      ids: produto.buyTogetherIds,
      descontoPct: produto.buyTogetherDiscountPct,
      produtos: itens,
    };
  }

  async definir(
    storeId: string,
    productId: string,
    ids: string[],
    descontoPct?: number,
  ) {
    if (
      descontoPct !== undefined &&
      (!Number.isInteger(descontoPct) ||
        descontoPct < 0 ||
        descontoPct > MAX_DESCONTO_COMBO_PCT)
    ) {
      throw new BadRequestException(
        `O desconto vai de 0 a ${MAX_DESCONTO_COMBO_PCT}%.`,
      );
    }
    await this.produto(storeId, productId);
    const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
    if (unicos.includes(productId)) {
      throw new BadRequestException(
        'O produto não pode ser sugerido com ele mesmo.',
      );
    }
    if (unicos.length > MAX_COMPRE_JUNTO) {
      throw new BadRequestException(
        `Escolha até ${MAX_COMPRE_JUNTO} produtos para comprar junto.`,
      );
    }
    const daLoja = await this.prisma.product.count({
      where: { storeId, id: { in: unicos } },
    });
    if (daLoja !== unicos.length) {
      throw new BadRequestException('Produto não encontrado na loja.');
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        buyTogetherIds: unicos,
        ...(descontoPct !== undefined
          ? { buyTogetherDiscountPct: descontoPct }
          : {}),
      },
    });
    return this.doPainel(storeId, productId);
  }

  /**
   * Vitrine: só o que dá para comprar agora (ativo e com estoque). Produto
   * apagado ou esgotado some sem o lojista precisar mexer.
   */
  async daVitrine(storeId: string, idOrSlug: string) {
    const produto = await this.prisma.product.findFirst({
      where: {
        storeId,
        active: true,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { buyTogetherIds: true, buyTogetherDiscountPct: true },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    const items = await this.buscar(storeId, produto.buyTogetherIds, true);
    return {
      descontoPct: items.length ? produto.buyTogetherDiscountPct : 0,
      items,
    };
  }

  /**
   * Desconto do combo em centavos para estas linhas, com os preços e as
   * regras do banco. Usado pelo pedido (vale o que for cobrado) e pela
   * prévia do checkout.
   */
  async descontoCents(
    storeId: string,
    linhas: { productId: string; unitPrice: number; quantity: number }[],
  ) {
    const ids = [...new Set(linhas.map((l) => l.productId))];
    if (ids.length < 2) return 0;
    const produtos = await this.prisma.product.findMany({
      where: {
        storeId,
        id: { in: ids },
        buyTogetherDiscountPct: { gt: 0 },
      },
      select: { id: true, buyTogetherIds: true, buyTogetherDiscountPct: true },
    });
    if (produtos.length === 0) return 0;
    const regras = new Map<string, RegraDeCombo>(
      produtos.map((p) => [
        p.id,
        { pct: p.buyTogetherDiscountPct, sugeridos: p.buyTogetherIds },
      ]),
    );
    return descontoDoComboCents(
      linhas.map((l) => ({
        productId: l.productId,
        precoCents: Math.round(l.unitPrice * 100),
        quantidade: l.quantity,
      })),
      regras,
    );
  }

  /** Prévia do checkout: preços do banco (o carrinho do navegador não vale). */
  async previa(
    storeId: string,
    itens: { productId: string; variantId?: string; quantity: number }[],
  ) {
    const produtos = await this.prisma.product.findMany({
      where: {
        storeId,
        active: true,
        id: { in: itens.map((i) => i.productId) },
      },
      select: {
        id: true,
        price: true,
        variants: { select: { id: true, price: true } },
      },
    });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const linhas = itens.flatMap((i) => {
      const p = porId.get(i.productId);
      if (!p) return [];
      const v = i.variantId
        ? p.variants.find((x) => x.id === i.variantId)
        : undefined;
      const preco = v?.price != null ? v.price : p.price;
      return [
        {
          productId: p.id,
          unitPrice: Number(preco),
          quantity: Math.max(0, Math.floor(i.quantity)),
        },
      ];
    });
    const cents = await this.descontoCents(storeId, linhas);
    return { desconto: cents / 100 };
  }

  private async produto(storeId: string, id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, storeId },
      select: { id: true, buyTogetherIds: true, buyTogetherDiscountPct: true },
    });
    if (!p) throw new NotFoundException('Produto não encontrado');
    return p;
  }

  private async buscar(storeId: string, ids: string[], soVendaveis: boolean) {
    if (ids.length === 0) return [];
    const linhas = await this.prisma.product.findMany({
      where: {
        storeId,
        id: { in: ids },
        ...(soVendaveis ? { active: true, stock: { gt: 0 } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        compareAt: true,
        installments: true,
        stock: true,
        active: true,
        hasVariants: true,
        images: {
          orderBy: { position: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    });
    // Na ordem que o lojista escolheu
    const porId = new Map(linhas.map((l) => [l.id, l]));
    return ids.flatMap((id) => {
      const l = porId.get(id);
      return l
        ? [
            {
              ...l,
              price: String(l.price),
              compareAt: l.compareAt ? String(l.compareAt) : null,
            },
          ]
        : [];
    });
  }
}
