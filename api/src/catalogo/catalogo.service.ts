import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { montarFeed, type ProdutoFeed } from './feed';

/** Teto do feed: o Google aceita bem mais, mas loja pequena não chega perto. */
const LIMITE = 5000;

@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private site() {
    return (
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000'
    );
  }

  /** Endereço da vitrine (domínio próprio ou /loja/slug). */
  private baseDaLoja(store: { slug: string; customDomain: string | null }) {
    return store.customDomain
      ? `https://${store.customDomain}`
      : `${this.site()}/loja/${store.slug}`;
  }

  /** Endereço do arquivo que o lojista cola no Google e no Meta. */
  enderecoDoFeed(store: { slug: string; customDomain: string | null }) {
    const base = store.customDomain
      ? `https://${store.customDomain}`
      : this.site();
    return `${base}/api/public/catalogo/${store.slug}.xml`;
  }

  private async produtos(storeId: string): Promise<ProdutoFeed[]> {
    const rows = await this.prisma.product.findMany({
      where: { storeId, active: true, price: { gt: 0 } },
      include: {
        images: { orderBy: { position: 'asc' }, select: { url: true } },
        variants: { where: { active: true }, orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: LIMITE,
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      sku: p.sku,
      brand: p.brand,
      price: Number(p.price),
      compareAt: p.compareAt != null ? Number(p.compareAt) : null,
      stock: p.stock,
      categoria: p.category?.name ?? null,
      imagens: p.images.map((i) => i.url),
      variantes: p.hasVariants
        ? p.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            barcode: v.barcode,
            label: v.label,
            price: v.price != null ? Number(v.price) : null,
            compareAt: v.compareAt != null ? Number(v.compareAt) : null,
            stock: v.stock,
            imageUrl: v.imageUrl,
          }))
        : [],
    }));
  }

  async feedXml(slug: string): Promise<string> {
    const store = await this.prisma.store.findFirst({
      where: { slug, status: { not: StoreStatus.SUSPENDED } },
      select: { id: true, name: true, slug: true, customDomain: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return montarFeed(
      { nome: store.name, baseUrl: this.baseDaLoja(store) },
      await this.produtos(store.id),
    );
  }

  /** Painel: endereço do feed e quantos produtos entram (e por que não). */
  async resumo(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { slug: true, customDomain: true },
    });
    const produtos = await this.produtos(storeId);
    const semFoto = produtos.filter((p) => p.imagens.length === 0).length;
    return {
      url: this.enderecoDoFeed(store),
      produtosNoCatalogo: produtos.length - semFoto,
      produtosSemFoto: semFoto,
    };
  }
}
