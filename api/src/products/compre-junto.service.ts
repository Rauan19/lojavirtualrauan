import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Mais que isso vira vitrine, não sugestão: o cliente para de olhar. */
export const MAX_COMPRE_JUNTO = 3;

/**
 * "Compre junto": o lojista escolhe até 3 produtos que combinam com este
 * (a capinha do celular, o cinto da calça) e a página do produto oferece
 * levar tudo num clique. Preço é o de cada produto: o pedido recalcula tudo
 * no servidor, como sempre.
 */
@Injectable()
export class CompreJuntoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Painel: os escolhidos, inclusive inativos (para o lojista ver e trocar). */
  async doPainel(storeId: string, productId: string) {
    const produto = await this.produto(storeId, productId);
    const itens = await this.buscar(storeId, produto.buyTogetherIds, false);
    return { ids: produto.buyTogetherIds, produtos: itens };
  }

  async definir(storeId: string, productId: string, ids: string[]) {
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
      data: { buyTogetherIds: unicos },
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
      select: { buyTogetherIds: true },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    return { items: await this.buscar(storeId, produto.buyTogetherIds, true) };
  }

  private async produto(storeId: string, id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, storeId },
      select: { id: true, buyTogetherIds: true },
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
