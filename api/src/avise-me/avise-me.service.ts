import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreStatus } from '@prisma/client';
import { SweepRunner } from '../common/utils/sweep-runner';
import { emTrava, TravasService } from '../fila/travas.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildChegouEmail } from './chegou-email';

/** De 10 em 10 minutos: quem esperava fica sabendo logo. */
const VARREDURA_MS = 10 * 60 * 1000;
const LOTE = 200;
/** Pedido de aviso com mais de 6 meses não é mais avisado. */
const VALIDADE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * "Avise-me quando chegar": o cliente deixa o e-mail num produto esgotado e
 * recebe um aviso (um só) quando o estoque volta.
 */
@Injectable()
export class AviseMeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AviseMeService.name);
  private readonly sweeper = new SweepRunner(
    () => emTrava(this.travas, 'avise-me', () => this.varrer()),
    VARREDURA_MS,
    (err) =>
      this.logger.error(
        `Varredura do avise-me falhou: ${err instanceof Error ? err.message : String(err)}`,
      ),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly travas?: TravasService,
  ) {}

  onModuleInit() {
    this.sweeper.start();
  }

  async onModuleDestroy() {
    await this.sweeper.stop();
  }

  /** Vitrine: guarda o pedido de aviso (só para produto esgotado). */
  async registrar(
    storeId: string,
    dados: { productId: string; variantId?: string; email: string },
  ) {
    const email = dados.email.trim().toLowerCase();
    const variantId = dados.variantId?.trim() || '';
    const produto = await this.prisma.product.findFirst({
      where: { id: dados.productId, storeId, active: true },
      select: {
        stock: true,
        hasVariants: true,
        variants: {
          where: { id: variantId || '__nenhuma__', active: true },
          select: { stock: true },
        },
      },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    if (produto.hasVariants && !variantId) {
      throw new BadRequestException('Escolha a opção que você quer.');
    }
    const estoque = variantId ? produto.variants[0]?.stock : produto.stock;
    if (estoque === undefined) {
      throw new NotFoundException('Opção não encontrada');
    }
    if (estoque > 0) {
      throw new BadRequestException(
        'Este produto está disponível: é só comprar.',
      );
    }
    // Já pediu antes: renova o pedido (pode ter sido avisado numa volta antiga)
    await this.prisma.stockAlert.upsert({
      where: {
        productId_variantId_email: {
          productId: dados.productId,
          variantId,
          email,
        },
      },
      create: { storeId, productId: dados.productId, variantId, email },
      update: { notifiedAt: null, createdAt: new Date() },
    });
    return { ok: true };
  }

  private linkDoProduto(
    store: { slug: string; customDomain: string | null },
    slug: string,
    variantId: string,
  ) {
    const base = store.customDomain
      ? `https://${store.customDomain}`
      : `${
          this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
          'http://localhost:3000'
        }/loja/${store.slug}`;
    const variante = variantId
      ? `?variante=${encodeURIComponent(variantId)}`
      : '';
    return `${base}/p/${encodeURIComponent(slug)}${variante}`;
  }

  /** Avisa quem esperava produto que voltou ao estoque. */
  async varrer(): Promise<number> {
    const pendentes = await this.prisma.stockAlert.findMany({
      where: {
        notifiedAt: null,
        createdAt: { gt: new Date(Date.now() - VALIDADE_MS) },
        store: { status: { not: StoreStatus.SUSPENDED } },
        product: { active: true },
      },
      include: {
        store: {
          select: {
            name: true,
            slug: true,
            customDomain: true,
            accentColor: true,
          },
        },
        product: {
          select: {
            name: true,
            slug: true,
            price: true,
            stock: true,
            images: {
              orderBy: { position: 'asc' },
              take: 1,
              select: { url: true },
            },
            variants: {
              select: {
                id: true,
                stock: true,
                price: true,
                label: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: LOTE,
    });

    let enviados = 0;
    for (const a of pendentes) {
      const v = a.variantId
        ? a.product.variants.find((x) => x.id === a.variantId && x.active)
        : null;
      if (a.variantId && !v) continue; // opção apagada ou desativada
      const estoque = v ? v.stock : a.product.stock;
      if (estoque <= 0) continue;

      // Marca antes de enviar: dois processos não mandam dois e-mails
      const r = await this.prisma.stockAlert.updateMany({
        where: { id: a.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (r.count !== 1) continue;

      const email = buildChegouEmail({
        storeName: a.store.name,
        produto: v ? `${a.product.name} (${v.label})` : a.product.name,
        preco: Number(v?.price ?? a.product.price),
        link: this.linkDoProduto(a.store, a.product.slug, a.variantId),
        imagem: a.product.images[0]?.url,
        accentColor: a.store.accentColor || undefined,
      });
      const res = await this.mail
        .send({ to: a.email, ...email })
        .catch(() => ({ sent: false }));
      if (!res.sent) {
        // Sem SMTP ou falhou: tenta de novo na próxima volta
        await this.prisma.stockAlert.update({
          where: { id: a.id },
          data: { notifiedAt: null },
        });
        continue;
      }
      enviados++;
    }
    if (enviados) this.logger.log(`Avise-me: ${enviados} aviso(s) enviado(s)`);
    return enviados;
  }

  /** Painel: quantas pessoas esperam cada produto esgotado. */
  async painel(storeId: string) {
    const grupos = await this.prisma.stockAlert.groupBy({
      by: ['productId', 'variantId'],
      where: { storeId, notifiedAt: null },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    if (!grupos.length) return { totalEsperando: 0, produtos: [] };
    const produtos = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(grupos.map((g) => g.productId))] } },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        variants: { select: { id: true, label: true, stock: true } },
      },
    });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const linhas = grupos
      .map((g) => {
        const p = porId.get(g.productId);
        if (!p) return null;
        const v = g.variantId
          ? p.variants.find((x) => x.id === g.variantId)
          : null;
        return {
          productId: p.id,
          nome: v ? `${p.name} (${v.label})` : p.name,
          codigo: p.sku,
          esperando: g._count._all,
          estoque: v ? v.stock : p.stock,
          desde: g._min.createdAt,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => b.esperando - a.esperando);
    return {
      totalEsperando: linhas.reduce((s, l) => s + l.esperando, 0),
      produtos: linhas,
    };
  }
}
