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
import { PaymentStatus, StoreStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { SweepRunner } from '../common/utils/sweep-runner';
import { safeEqual } from '../common/utils/safe-equal';
import { emTrava, TravasService } from '../fila/travas.service';
import { buildCarrinhoAbandonadoEmail } from '../mail/carrinho-abandonado-email';
import { MailService } from '../mail/mail.service';
import { paraCentavos } from '../platform-fee/calculo';
import { PrismaService } from '../prisma/prisma.service';
import { descontoPixCentavos } from './desconto-pix';

/** Varre de hora em hora (o pedido expira 1h depois de criado). */
const VARREDURA_MS = 60 * 60 * 1000;
/** Depois de 3 dias o lembrete não faz mais sentido. */
const JANELA_MS = 3 * 24 * 60 * 60 * 1000;
const LOTE = 100;

/**
 * Carrinho abandonado: o cliente chegou ao pagamento, não pagou e o pedido
 * expirou. Um e-mail só, com um link que devolve os itens à sacola; e uma
 * lista no painel para o lojista chamar no WhatsApp.
 */
export const SITUACOES_CARRINHO = [
  'todos',
  'pendentes',
  'recuperados',
  'sem-lembrete',
] as const;
export type SituacaoCarrinho = (typeof SITUACOES_CARRINHO)[number];
/** Períodos do painel, em dias */
export const PERIODOS_CARRINHO = [7, 30, 90] as const;

@Injectable()
export class CarrinhoAbandonadoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CarrinhoAbandonadoService.name);
  private readonly sweeper = new SweepRunner(
    () => emTrava(this.travas, 'carrinho-abandonado', () => this.varrer()),
    VARREDURA_MS,
    (err) =>
      this.logger.error(
        `Varredura de carrinho abandonado falhou: ${err instanceof Error ? err.message : String(err)}`,
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

  // ---------- link de recuperação ----------

  private assinatura(orderId: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`carrinho-abandonado:${orderId}`)
      .digest('base64url')
      .slice(0, 32);
  }

  token(orderId: string) {
    return `${orderId}.${this.assinatura(orderId)}`;
  }

  private lerToken(token: string): string {
    const [orderId, sig] = (token || '').split('.');
    if (!orderId || !sig || !safeEqual(sig, this.assinatura(orderId))) {
      throw new BadRequestException('Link inválido.');
    }
    return orderId;
  }

  private baseDaLoja(store: { slug: string; customDomain: string | null }) {
    return store.customDomain
      ? `https://${store.customDomain}`
      : `${
          this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
          'http://localhost:3000'
        }/loja/${store.slug}`;
  }

  link(store: { slug: string; customDomain: string | null }, orderId: string) {
    return `${this.baseDaLoja(store)}/checkout?recuperar=${encodeURIComponent(this.token(orderId))}`;
  }

  // ---------- varredura (e-mail automático) ----------

  async varrer(): Promise<number> {
    const agora = Date.now();
    const pedidos = await this.prisma.order.findMany({
      where: {
        expiredUnpaidAt: { gt: new Date(agora - JANELA_MS) },
        recoveryEmailSentAt: null,
        customerEmail: { not: '' },
        store: {
          abandonedCartEmail: true,
          status: { not: StoreStatus.SUSPENDED },
        },
      },
      include: {
        items: true,
        store: {
          select: {
            name: true,
            slug: true,
            customDomain: true,
            accentColor: true,
            pixDiscountPercent: true,
            checkoutMode: true,
          },
        },
      },
      orderBy: { expiredUnpaidAt: 'asc' },
      take: LOTE,
    });

    let enviados = 0;
    for (const o of pedidos) {
      // Já voltou e comprou: não incomoda
      if (await this.voltouEComprou(o.storeId, o.customerId, o.createdAt))
        continue;

      // Marca antes de enviar: dois processos não mandam dois e-mails
      const r = await this.prisma.order.updateMany({
        where: { id: o.id, recoveryEmailSentAt: null },
        data: { recoveryEmailSentAt: new Date() },
      });
      if (r.count !== 1) continue;

      const pct =
        o.store.checkoutMode === 'pro'
          ? 0
          : Number(o.store.pixDiscountPercent ?? 0);
      const pix = descontoPixCentavos({
        subtotalCents: paraCentavos(o.subtotal),
        descontoCents: paraCentavos(o.discount),
        percentual: pct,
      });
      const email = buildCarrinhoAbandonadoEmail({
        storeName: o.store.name,
        customerName: o.customerName,
        itens: o.items.map((i) => ({
          nome: i.variantLabel
            ? `${i.productName} (${i.variantLabel})`
            : i.productName,
          quantidade: i.quantity,
          preco: Number(i.total),
        })),
        total: Number(o.total),
        totalNoPix: pix > 0 ? (paraCentavos(o.total) - pix) / 100 : null,
        linkRecuperar: this.link(o.store, o.id),
        accentColor: o.store.accentColor || undefined,
      });

      const res = await this.mail
        .send({ to: o.customerEmail.trim(), ...email })
        .catch(() => ({ sent: false }));
      if (!res.sent) {
        // Sem SMTP ou falhou: desmarca, para o painel não dizer "enviado"
        await this.prisma.order.update({
          where: { id: o.id },
          data: { recoveryEmailSentAt: null },
        });
        continue;
      }
      enviados++;
    }
    if (enviados)
      this.logger.log(
        `Carrinho abandonado: ${enviados} lembrete(s) enviado(s)`,
      );
    return enviados;
  }

  private async voltouEComprou(
    storeId: string,
    customerId: string | null,
    desde: Date,
  ) {
    if (!customerId) return null;
    return this.prisma.order.findFirst({
      where: {
        storeId,
        customerId,
        createdAt: { gt: desde },
        paymentStatus: { in: [PaymentStatus.APPROVED, PaymentStatus.REFUNDED] },
      },
      select: { id: true, orderNumber: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------- vitrine: devolver os itens à sacola ----------

  async itensParaRecuperar(storeId: string, token: string) {
    const orderId = this.lerToken(token);
    const pedido = await this.prisma.order.findFirst({
      where: { id: orderId, storeId, expiredUnpaidAt: { not: null } },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  orderBy: { position: 'asc' },
                  take: 1,
                  select: { url: true },
                },
              },
            },
            variant: true,
          },
        },
      },
    });
    if (!pedido) throw new NotFoundException('Este link não vale mais.');

    const itens = pedido.items
      .filter(
        (i) =>
          i.product?.active &&
          i.product.storeId === storeId &&
          (!i.variantId || i.variant?.active),
      )
      .map((i) => ({
        productId: i.productId as string,
        variantId: i.variantId,
        variantLabel: i.variant?.label ?? i.variantLabel,
        name: i.product!.name,
        sku: i.variant?.sku ?? i.product!.sku,
        price: Number(i.variant?.price ?? i.product!.price),
        image: i.product!.images[0]?.url ?? null,
        installmentsFree: i.product!.installments ?? null,
        quantity: i.quantity,
      }));
    return { itens, faltando: pedido.items.length - itens.length };
  }

  // ---------- painel do lojista ----------

  /**
   * Painel: carrinhos abandonados do período, com filtro, busca e página.
   *
   * Duas consultas leves para o período inteiro (os carrinhos e as compras
   * pagas desses clientes depois), em vez de uma consulta por carrinho; os
   * itens só são lidos para a página que vai para a tela.
   */
  async listar(
    storeId: string,
    opcoes: {
      dias?: number;
      situacao?: SituacaoCarrinho;
      busca?: string;
      pagina?: number;
      porPagina?: number;
    } = {},
  ) {
    const dias = PERIODOS_CARRINHO.includes(opcoes.dias as never)
      ? (opcoes.dias as number)
      : 30;
    const situacao = opcoes.situacao ?? 'todos';
    const porPagina = Math.min(Math.max(opcoes.porPagina || 20, 1), 100);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [store, pedidos] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { slug: true, customDomain: true, abandonedCartEmail: true },
      }),
      this.prisma.order.findMany({
        where: { storeId, expiredUnpaidAt: { gt: desde } },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          expiredUnpaidAt: true,
          recoveryEmailSentAt: true,
          customerId: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          total: true,
        },
        orderBy: [{ expiredUnpaidAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    // Compras pagas desses clientes depois do carrinho mais antigo: uma
    // consulta só, e o "voltou e comprou" de cada carrinho sai daqui
    const clientes = [
      ...new Set(pedidos.map((p) => p.customerId).filter(Boolean)),
    ] as string[];
    const maisAntigo = pedidos.reduce<Date | null>(
      (min, p) => (!min || p.createdAt < min ? p.createdAt : min),
      null,
    );
    const compras =
      clientes.length && maisAntigo
        ? await this.prisma.order.findMany({
            where: {
              storeId,
              customerId: { in: clientes },
              createdAt: { gt: maisAntigo },
              paymentStatus: {
                in: [PaymentStatus.APPROVED, PaymentStatus.REFUNDED],
              },
            },
            select: {
              customerId: true,
              createdAt: true,
              orderNumber: true,
              total: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    const porCliente = new Map<string, typeof compras>();
    for (const c of compras) {
      if (!c.customerId) continue;
      const lista = porCliente.get(c.customerId) ?? [];
      lista.push(c);
      porCliente.set(c.customerId, lista);
    }

    const linhas = pedidos.map((p) => {
      const voltou = p.customerId
        ? (porCliente.get(p.customerId) ?? []).find(
            (c) => c.createdAt > p.createdAt,
          )
        : undefined;
      return { p, voltou };
    });

    const pendentes = linhas.filter((l) => !l.voltou);
    const recuperadas = linhas.filter((l) => l.voltou);
    const resumo = {
      total: linhas.length,
      recuperados: recuperadas.length,
      taxa: linhas.length
        ? Math.round((recuperadas.length / linhas.length) * 100)
        : 0,
      valorEmAberto: pendentes.reduce((s, l) => s + Number(l.p.total), 0),
      valorRecuperado: recuperadas.reduce(
        (s, l) => s + Number(l.voltou?.total ?? 0),
        0,
      ),
    };
    const contagens = {
      todos: linhas.length,
      pendentes: pendentes.length,
      recuperados: recuperadas.length,
      semLembrete: pendentes.filter((l) => !l.p.recoveryEmailSentAt).length,
    };

    const termo = opcoes.busca?.trim().toLowerCase() ?? '';
    const digitos = termo.replace(/\D/g, '');
    const filtradas = linhas.filter(({ p, voltou }) => {
      if (situacao === 'pendentes' && voltou) return false;
      if (situacao === 'recuperados' && !voltou) return false;
      if (situacao === 'sem-lembrete' && (voltou || p.recoveryEmailSentAt))
        return false;
      if (!termo) return true;
      return (
        p.customerName.toLowerCase().includes(termo) ||
        p.customerEmail.toLowerCase().includes(termo) ||
        (digitos.length >= 3 &&
          ((p.customerPhone || '').replace(/\D/g, '').includes(digitos) ||
            p.orderNumber.includes(digitos)))
      );
    });

    const total = filtradas.length;
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(opcoes.pagina || 1, 1), totalPaginas);
    const daPagina = filtradas.slice(
      (pagina - 1) * porPagina,
      pagina * porPagina,
    );

    const itens = await this.prisma.orderItem.findMany({
      where: { orderId: { in: daPagina.map((l) => l.p.id) } },
      select: {
        orderId: true,
        productName: true,
        variantLabel: true,
        quantity: true,
      },
    });
    const itensDo = new Map<string, { nome: string; quantidade: number }[]>();
    for (const i of itens) {
      const lista = itensDo.get(i.orderId) ?? [];
      lista.push({
        nome: i.variantLabel
          ? `${i.productName} (${i.variantLabel})`
          : i.productName,
        quantidade: i.quantity,
      });
      itensDo.set(i.orderId, lista);
    }

    return {
      emailAutomatico: store.abandonedCartEmail,
      dias,
      resumo,
      contagens,
      // compatível com quem lia os números soltos
      total: resumo.total,
      recuperados: resumo.recuperados,
      carrinhos: daPagina.map(({ p, voltou }) => ({
        id: p.id,
        orderNumber: p.orderNumber,
        abandonadoEm: p.expiredUnpaidAt,
        emailEnviadoEm: p.recoveryEmailSentAt,
        cliente: p.customerName,
        email: p.customerEmail,
        telefone: p.customerPhone,
        total: Number(p.total),
        itens: itensDo.get(p.id) ?? [],
        recuperadoNoPedido: voltou?.orderNumber ?? null,
        link: this.link(store, p.id),
      })),
      paginacao: { total, pagina, porPagina, totalPaginas },
    };
  }

  async configurar(storeId: string, emailAutomatico: boolean) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: { abandonedCartEmail: emailAutomatico },
    });
    return { emailAutomatico };
  }
}
