import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { OrderMailService } from '../mail/order-mail.service';

const TRACK_SWEEP_MS = 20 * 60 * 1000;

type MeWebhookBody = {
  event?: string;
  data?: {
    id?: string;
    protocol?: string;
    status?: string;
    tracking?: string | null;
    self_tracking?: string | null;
    tracking_url?: string | null;
    delivered_at?: string | null;
    posted_at?: string | null;
  };
};

/**
 * Atualiza status de envio com base em rastreio real
 * (webhook Melhor Envio + consulta Correios / ME).
 * NÃO marca entregue por calendário.
 */
@Injectable()
export class TrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackingService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderMail: OrderMailService,
    private readonly secrets: SecretsService,
  ) {}

  onModuleInit() {
    void this.syncOpenShipments();
    this.timer = setInterval(() => {
      void this.syncOpenShipments();
    }, TRACK_SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Webhook Melhor Envio — order.posted / order.delivered / etc. */
  async handleMelhorEnvioWebhook(body: MeWebhookBody) {
    const event = String(body?.event || '');
    const data = body?.data || {};
    const shipmentId = data.id?.trim() || null;
    const tracking =
      (data.tracking || data.self_tracking || '')?.toString().trim() || null;
    const trackingUrl = data.tracking_url?.trim() || null;

    if (!shipmentId && !tracking) {
      this.logger.warn(`Webhook ME sem id/tracking: ${event}`);
      return { ok: true, matched: 0 };
    }

    const order = await this.findOrderForCarrier({
      carrierShipmentId: shipmentId,
      trackingCode: tracking,
    });
    if (!order) {
      this.logger.warn(
        `Webhook ME sem pedido: event=${event} id=${shipmentId} track=${tracking}`,
      );
      return { ok: true, matched: 0 };
    }

    if (event === 'order.delivered' || data.status === 'delivered') {
      await this.markDelivered(order.id, {
        trackingCode: tracking || order.trackingCode,
        trackingUrl: trackingUrl || order.trackingUrl,
        carrierShipmentId: shipmentId || order.carrierShipmentId,
        deliveredAt: data.delivered_at
          ? new Date(data.delivered_at)
          : new Date(),
      });
      return { ok: true, matched: 1, status: 'DELIVERED', orderId: order.id };
    }

    if (
      event === 'order.posted' ||
      event === 'order.generated' ||
      event === 'order.released' ||
      data.status === 'posted' ||
      data.status === 'generated'
    ) {
      await this.markShipped(order.id, {
        trackingCode: tracking || order.trackingCode,
        trackingUrl: trackingUrl || order.trackingUrl,
        carrierShipmentId: shipmentId || order.carrierShipmentId,
      });
      return { ok: true, matched: 1, status: 'SHIPPED', orderId: order.id };
    }

    // Atualiza vínculo mesmo sem mudar status
    if (tracking || shipmentId || trackingUrl) {
      const prevCode = order.trackingCode;
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          ...(tracking ? { trackingCode: tracking } : {}),
          ...(trackingUrl ? { trackingUrl } : {}),
          ...(shipmentId ? { carrierShipmentId: shipmentId } : {}),
        },
      });
      if (tracking) {
        await this.orderMail.notifyTrackingIfNew(order.id, prevCode);
      }
    }

    return { ok: true, matched: 1, event, orderId: order.id };
  }

  async syncOpenShipments() {
    try {
      const orders = await this.prisma.order.findMany({
        where: {
          paymentStatus: PaymentStatus.APPROVED,
          status: {
            in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED],
          },
          OR: [
            { trackingCode: { not: null } },
            { carrierShipmentId: { not: null } },
          ],
        },
        take: 80,
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          storeId: true,
          status: true,
          trackingCode: true,
          trackingUrl: true,
          carrierShipmentId: true,
        },
      });

      let updated = 0;
      for (const order of orders) {
        const rawStore = await this.prisma.store.findUnique({
          where: { id: order.storeId },
          select: {
            freteModo: true,
            freteToken: true,
            freteSandbox: true,
            freteEmailContato: true,
          },
        });
        const store = rawStore ? this.secrets.decryptStore(rawStore) : null;

        let result: 'SHIPPED' | 'DELIVERED' | null = null;

        if (
          store?.freteModo === 'melhor_envio' &&
          store.freteToken?.trim() &&
          order.carrierShipmentId
        ) {
          result = await this.checkMelhorEnvioShipment(
            store.freteToken.trim(),
            !!store.freteSandbox,
            store.freteEmailContato || 'loja@example.com',
            order.carrierShipmentId,
          );
        }

        if (!result && order.trackingCode) {
          result = await this.checkCorreiosTracking(order.trackingCode);
        }

        if (result === 'DELIVERED') {
          await this.markDelivered(order.id, {});
          updated += 1;
        } else if (
          result === 'SHIPPED' &&
          order.status !== OrderStatus.SHIPPED &&
          order.status !== OrderStatus.DELIVERED
        ) {
          await this.markShipped(order.id, {});
          updated += 1;
        }
      }

      if (updated > 0) {
        this.logger.log(`Rastreio: ${updated} pedido(s) atualizados`);
      }
      return updated;
    } catch (err) {
      this.logger.warn(
        `Falha no sync de rastreio: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  private async findOrderForCarrier(opts: {
    carrierShipmentId?: string | null;
    trackingCode?: string | null;
  }) {
    if (opts.carrierShipmentId) {
      const byId = await this.prisma.order.findFirst({
        where: { carrierShipmentId: opts.carrierShipmentId },
      });
      if (byId) return byId;
    }
    if (opts.trackingCode) {
      return this.prisma.order.findFirst({
        where: { trackingCode: opts.trackingCode },
        orderBy: { updatedAt: 'desc' },
      });
    }
    return null;
  }

  private async markShipped(
    orderId: string,
    extra: {
      trackingCode?: string | null;
      trackingUrl?: string | null;
      carrierShipmentId?: string | null;
    },
  ) {
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!current || current.status === OrderStatus.DELIVERED) return;
    if (
      current.status === OrderStatus.CANCELLED ||
      current.status === OrderStatus.REFUNDED
    ) {
      return;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED,
        shippedAt: current.shippedAt || new Date(),
        ...(extra.trackingCode ? { trackingCode: extra.trackingCode } : {}),
        ...(extra.trackingUrl ? { trackingUrl: extra.trackingUrl } : {}),
        ...(extra.carrierShipmentId
          ? { carrierShipmentId: extra.carrierShipmentId }
          : {}),
      },
    });

    if (extra.trackingCode?.trim()) {
      await this.orderMail.notifyTrackingIfNew(orderId, current.trackingCode);
    }
  }

  private async markDelivered(
    orderId: string,
    extra: {
      trackingCode?: string | null;
      trackingUrl?: string | null;
      carrierShipmentId?: string | null;
      deliveredAt?: Date;
    },
  ) {
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!current || current.status === OrderStatus.DELIVERED) return;
    if (
      current.status === OrderStatus.CANCELLED ||
      current.status === OrderStatus.REFUNDED
    ) {
      return;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: extra.deliveredAt || new Date(),
        shippedAt: current.shippedAt || new Date(),
        ...(extra.trackingCode ? { trackingCode: extra.trackingCode } : {}),
        ...(extra.trackingUrl ? { trackingUrl: extra.trackingUrl } : {}),
        ...(extra.carrierShipmentId
          ? { carrierShipmentId: extra.carrierShipmentId }
          : {}),
      },
    });
  }

  private async checkMelhorEnvioShipment(
    token: string,
    sandbox: boolean,
    email: string,
    shipmentId: string,
  ): Promise<'SHIPPED' | 'DELIVERED' | null> {
    const base = sandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://www.melhorenvio.com.br';
    try {
      const res = await fetch(`${base}/api/v2/me/orders/${shipmentId}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `LojaVirtualMensalidade (${email})`,
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { status?: string };
      const st = String(data.status || '').toLowerCase();
      if (st === 'delivered') return 'DELIVERED';
      if (
        st === 'posted' ||
        st === 'generated' ||
        st === 'released' ||
        st === 'received'
      ) {
        return 'SHIPPED';
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Consulta pública do app Correios (mesmo fluxo de várias lojas BR).
   * Só confia em eventos explícitos de entrega.
   */
  private async checkCorreiosTracking(
    code: string,
  ): Promise<'SHIPPED' | 'DELIVERED' | null> {
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length < 8) return null;
    try {
      const res = await fetch(
        `https://proxyapp.correios.com.br/v1/sro-rastro/${encodeURIComponent(cleaned)}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        objetos?: Array<{
          eventos?: Array<{ codigo?: string; descricao?: string }>;
        }>;
      };
      const eventos = data.objetos?.[0]?.eventos || [];
      if (!eventos.length) return null;
      const text = eventos
        .map((e) => `${e.codigo || ''} ${e.descricao || ''}`.toLowerCase())
        .join(' | ');
      if (
        text.includes('entregue') ||
        text.includes('objeto entregue') ||
        /bde|bdi|bdr/.test(text)
      ) {
        // códigos BDE/BDI/BDR costumam ser entrega
        const top =
          `${eventos[0]?.codigo || ''} ${eventos[0]?.descricao || ''}`.toLowerCase();
        if (top.includes('entregue') || /^(bde|bdi|bdr)/.test(top.trim())) {
          return 'DELIVERED';
        }
      }
      return 'SHIPPED';
    } catch {
      return null;
    }
  }
}
