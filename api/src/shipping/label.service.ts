import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { SecretsService } from '../common/secrets/secrets.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMelhorEnvioLabel,
  parseMelhorEnvioServiceId,
  type LabelParty,
} from './providers/melhor-envio-label';

type ShippingAddress = Record<string, unknown>;

function str(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * Compra a etiqueta na transportadora e grava rastreio + PDF no pedido.
 *
 * Antes disso o lojista cotava aqui e refazia o pedido na mão no painel do
 * Melhor Envio — inviável a partir de alguns pedidos por dia.
 */
@Injectable()
export class LabelService {
  private readonly logger = new Logger(LabelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  /**
   * Emite a etiqueta do pedido. Idempotente: pedido que já tem etiqueta
   * devolve a que existe em vez de comprar outra (isso gastaria saldo do
   * lojista duas vezes).
   */
  async generateForOrder(storeId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.carrierShipmentId && order.labelUrl) {
      return {
        ok: true,
        alreadyExists: true,
        shipmentId: order.carrierShipmentId,
        trackingCode: order.trackingCode,
        labelUrl: order.labelUrl,
      };
    }

    if (order.paymentStatus !== PaymentStatus.APPROVED) {
      throw new BadRequestException(
        'Só é possível gerar etiqueta de pedido pago',
      );
    }

    const storeRow = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!storeRow) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(storeRow);

    if (store.freteModo !== 'melhor_envio') {
      throw new BadRequestException(
        'Geração de etiqueta disponível apenas no modo Melhor Envio',
      );
    }
    if (!store.freteToken?.trim()) {
      throw new BadRequestException(
        'Configure o token do Melhor Envio em Configurações → Frete',
      );
    }
    if (!store.freteEmailContato?.trim()) {
      throw new BadRequestException(
        'Informe o e-mail de contato da loja (exigido pelo Melhor Envio)',
      );
    }

    const serviceId = parseMelhorEnvioServiceId(order.shippingServiceId);
    if (!serviceId) {
      throw new BadRequestException(
        'Este pedido não guardou o serviço de frete escolhido. Gere a etiqueta pelo painel do Melhor Envio.',
      );
    }

    const from = this.buildFrom(store);
    const to = this.buildTo(order);

    const products = order.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      unitaryValue: Number(item.unitPrice),
    }));

    // Um volume por item, respeitando a quantidade — o ME cobra por volume
    const volumes = order.items.flatMap((item) => {
      const p = item.product;
      const volume = {
        height: Number(p?.heightCm ?? 0) || 5,
        width: Number(p?.widthCm ?? 0) || 16,
        length: Number(p?.lengthCm ?? 0) || 20,
        weight: Number(p?.weightKg ?? 0) || 0.3,
      };
      return Array.from({ length: item.quantity }, () => volume);
    });

    const result = await createMelhorEnvioLabel({
      token: store.freteToken.trim(),
      sandbox: store.freteSandbox === true,
      contactEmail: store.freteEmailContato.trim(),
      serviceId,
      from,
      to,
      products,
      volumes,
      insuranceValue: Number(order.subtotal),
      reference: order.orderNumber,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        carrierShipmentId: result.shipmentId,
        labelUrl: result.labelUrl,
        ...(result.trackingCode ? { trackingCode: result.trackingCode } : {}),
      },
    });

    this.logger.log(
      `Etiqueta emitida · pedido ${order.orderNumber} · envio ${result.shipmentId}`,
    );

    return {
      ok: true,
      alreadyExists: false,
      shipmentId: result.shipmentId,
      trackingCode: result.trackingCode,
      labelUrl: result.labelUrl,
    };
  }

  /**
   * Emissão automática após o pagamento, quando o lojista liga a opção.
   * Nunca lança: falhar aqui não pode derrubar a confirmação do pagamento —
   * o lojista ainda pode emitir no botão.
   */
  async tryAutoGenerate(storeId: string, orderId: string) {
    try {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { freteEtiquetaAuto: true, freteModo: true },
      });
      if (!store?.freteEtiquetaAuto) return;
      if (store.freteModo !== 'melhor_envio') return;

      await this.generateForOrder(storeId, orderId);
    } catch (err) {
      this.logger.warn(
        `Etiqueta automática falhou · pedido ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private buildFrom(store: {
    sellerLegalName: string | null;
    sellerTradeName: string | null;
    name: string;
    sellerDocument: string | null;
    sellerPhone: string | null;
    sellerEmail: string | null;
    freteEmailContato: string | null;
    freteRuaOrigem: string | null;
    freteNumeroOrigem: string | null;
    freteComplementoOrigem: string | null;
    freteBairroOrigem: string | null;
    freteCidadeOrigem: string | null;
    freteUfOrigem: string | null;
    freteCepOrigem: string | null;
    sellerIe: string | null;
  }): LabelParty {
    const missing: string[] = [];
    if (!store.freteRuaOrigem?.trim()) missing.push('rua');
    if (!store.freteNumeroOrigem?.trim()) missing.push('número');
    if (!store.freteBairroOrigem?.trim()) missing.push('bairro');
    if (!store.freteCidadeOrigem?.trim()) missing.push('cidade');
    if (!store.freteUfOrigem?.trim()) missing.push('UF');
    if (!store.freteCepOrigem?.trim()) missing.push('CEP');
    if (!store.sellerDocument?.trim()) missing.push('CPF/CNPJ do lojista');

    if (missing.length) {
      throw new BadRequestException(
        `Complete o endereço de origem em Configurações → Frete (falta: ${missing.join(', ')})`,
      );
    }

    return {
      name:
        store.sellerLegalName?.trim() ||
        store.sellerTradeName?.trim() ||
        store.name,
      phone: store.sellerPhone,
      email: store.sellerEmail?.trim() || store.freteEmailContato,
      document: store.sellerDocument,
      stateRegister: store.sellerIe?.trim() || null,
      address: store.freteRuaOrigem!.trim(),
      number: store.freteNumeroOrigem!.trim(),
      complement: store.freteComplementoOrigem,
      district: store.freteBairroOrigem!.trim(),
      city: store.freteCidadeOrigem!.trim(),
      stateAbbr: store.freteUfOrigem!.trim(),
      postalCode: store.freteCepOrigem!.trim(),
    };
  }

  private buildTo(order: {
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    customerDocument: string | null;
    shippingAddress: unknown;
  }): LabelParty {
    const addr = (order.shippingAddress || {}) as ShippingAddress;

    const street = str(addr.street);
    const district = str(addr.neighborhood);
    const city = str(addr.city);
    const state = str(addr.state);
    const zip = str(addr.zipCode).replace(/\D/g, '');

    const missing: string[] = [];
    if (!street) missing.push('rua');
    if (!district) missing.push('bairro');
    if (!city) missing.push('cidade');
    if (!state) missing.push('UF');
    if (zip.length !== 8) missing.push('CEP');

    if (missing.length) {
      throw new BadRequestException(
        `Endereço de entrega incompleto (falta: ${missing.join(', ')})`,
      );
    }

    return {
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail,
      document: order.customerDocument,
      address: street,
      number: str(addr.number) || 's/n',
      complement: str(addr.complement) || null,
      district,
      city,
      stateAbbr: state,
      postalCode: zip,
    };
  }
}
