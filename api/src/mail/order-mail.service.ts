import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GUEST_TRACKING_TTL,
  OrderAccessService,
} from '../common/order-access/order-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { buildOrderEmail } from './order-status-email';
import {
  buildRefundEmail,
  type RefundMailKind,
} from './refund-email';
import {
  buildTrackingAvailableEmail,
  resolvePublicTrackingUrl,
} from './tracking-email';

/**
 * Avisa o cliente quando o rastreio fica disponível pela 1ª vez
 * (código vazio → preenchido).
 */
@Injectable()
export class OrderMailService {
  private readonly logger = new Logger(OrderMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly orderAccess: OrderAccessService,
  ) {}

  /**
   * @param previousTrackingCode código antes do update (null/vazio = ainda não tinha)
   * @param orderId pedido já atualizado no banco
   */
  async notifyTrackingIfNew(
    orderId: string,
    previousTrackingCode?: string | null,
  ): Promise<void> {
    const prev = (previousTrackingCode || '').trim();
    if (prev) return; // já tinha código — não spam

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          customerName: true,
          trackingCode: true,
          trackingUrl: true,
          shippingMethod: true,
          customer: {
            select: {
              id: true,
              email: true,
              storeId: true,
              tokenVersion: true,
              passwordHash: true,
            },
          },
          store: {
            select: {
              name: true,
              slug: true,
              customDomain: true,
              accentColor: true,
            },
          },
        },
      });

      if (!order?.trackingCode?.trim() || !order.customerEmail?.trim()) {
        return;
      }

      const trackingCode = order.trackingCode.trim();
      const trackingUrl = resolvePublicTrackingUrl(
        trackingCode,
        order.trackingUrl,
        order.shippingMethod,
      );
      const ordersUrl = await this.trackingUrlFor(order.store, order);
      const mail = buildTrackingAvailableEmail({
        storeName: order.store.name,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        trackingCode,
        trackingUrl,
        ordersUrl,
        accentColor: order.store.accentColor || undefined,
      });

      const result = await this.mail.send({
        to: order.customerEmail.trim(),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      if (result.sent) {
        this.logger.log(
          `E-mail de rastreio enviado order=${order.orderNumber} to=${order.customerEmail}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao avisar rastreio order=${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Confirmação de pedido criado (`received`) e de pagamento aprovado (`paid`).
   *
   * Nunca lança: e-mail que falha não pode derrubar um checkout nem um webhook
   * do Mercado Pago — o pedido já é válido sem o aviso.
   */
  /**
   * Avisos do fluxo de reembolso. O `requested` é obrigação legal (Decreto
   * 7.962/2013 art. 5º, §1º), os demais evitam que o cliente fique no escuro.
   *
   * Nunca lança, como os outros: e-mail que falha não pode derrubar a
   * operação que já aconteceu.
   */
  async notifyRefund(
    orderId: string,
    kind: RefundMailKind,
    rejectReason?: string | null,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          customerName: true,
          refundReasonType: true,
          customer: {
            select: {
              id: true,
              email: true,
              storeId: true,
              tokenVersion: true,
              passwordHash: true,
            },
          },
          store: {
            select: {
              name: true,
              slug: true,
              customDomain: true,
              accentColor: true,
            },
          },
        },
      });
      if (!order?.customerEmail?.trim()) return;

      const mail = buildRefundEmail({
        kind,
        storeName: order.store.name,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        reasonType: order.refundReasonType,
        rejectReason,
        orderUrl: await this.trackingUrlFor(order.store, order),
        accentColor: order.store.accentColor || undefined,
      });

      const result = await this.mail.send({
        to: order.customerEmail.trim(),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (result.sent) {
        this.logger.log(
          `E-mail de reembolso "${kind}" enviado order=${order.orderNumber}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar e-mail de reembolso (order=${orderId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async notifyOrder(
    orderId: string,
    kind: 'received' | 'paid',
    paymentHint?: string | null,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          customerName: true,
          subtotal: true,
          shippingCost: true,
          discount: true,
          total: true,
          customer: {
            select: {
              id: true,
              email: true,
              storeId: true,
              tokenVersion: true,
              passwordHash: true,
            },
          },
          items: {
            select: {
              productName: true,
              variantLabel: true,
              quantity: true,
              total: true,
            },
          },
          store: {
            select: {
              name: true,
              slug: true,
              customDomain: true,
              accentColor: true,
            },
          },
        },
      });

      if (!order?.customerEmail?.trim()) return;

      const mail = buildOrderEmail({
        kind,
        storeName: order.store.name,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          productName: item.productName,
          variantLabel: item.variantLabel,
          quantity: item.quantity,
          total: Number(item.total),
        })),
        subtotal: Number(order.subtotal),
        shippingCost: Number(order.shippingCost),
        discount: Number(order.discount),
        total: Number(order.total),
        orderUrl: await this.trackingUrlFor(order.store, order),
        accentColor: order.store.accentColor || undefined,
        paymentHint,
      });

      const result = await this.mail.send({
        to: order.customerEmail.trim(),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      if (result.sent) {
        this.logger.log(
          `E-mail "${kind}" enviado order=${order.orderNumber} to=${order.customerEmail}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar e-mail "${kind}" order=${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private ordersUrl(
    store: { slug: string; customDomain: string | null },
    orderId: string,
  ) {
    if (store.customDomain) {
      return `https://${store.customDomain}/conta/pedidos/${orderId}`;
    }
    const front =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    return `${front}/loja/${store.slug}/conta/pedidos/${orderId}`;
  }

  /**
   * Link de acompanhamento do pedido.
   *
   * Quem tem conta vai para "Minhas compras". Quem comprou sem cadastro não
   * consegue entrar em lugar nenhum, então recebe um link assinado, válido
   * por 90 dias e restrito a este pedido.
   */
  private async trackingUrlFor(
    store: { slug: string; customDomain: string | null },
    order: {
      id: string;
      customer: {
        id: string;
        email: string;
        storeId: string;
        tokenVersion: number;
        passwordHash: string | null;
      } | null;
    },
  ): Promise<string> {
    const guest = order.customer && !order.customer.passwordHash;
    if (!guest || !order.customer) {
      return this.ordersUrl(store, order.id);
    }

    const token = await this.orderAccess.sign(
      order.customer,
      order.id,
      GUEST_TRACKING_TTL,
    );
    const base = store.customDomain
      ? `https://${store.customDomain}`
      : `${
          this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
          'http://localhost:3000'
        }/loja/${store.slug}`;

    return `${base}/pedido/${order.id}?t=${encodeURIComponent(token)}`;
  }
}
