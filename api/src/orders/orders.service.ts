import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { CouponsService } from '../coupons/coupons.service';
import { InvoicesService } from '../invoices/invoices.service';
import { OrderMailService } from '../mail/order-mail.service';
import { PrinterService, ReceiptLine } from '../printing/printer.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ShipOption } from '../shipping/providers/types';
import { LabelService } from '../shipping/label.service';
import { ShippingService } from '../shipping/shipping.service';
import { onlyDigits } from '../stores/store-type';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';

/** Pedido sem pagar some de "minhas compras" e não pode mais ser pago. */
const UNPAID_ORDER_TTL_MS = 60 * 60 * 1000;
const EXPIRE_SWEEP_MS = 5 * 60 * 1000;

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private expireTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly printerService: PrinterService,
    private readonly invoicesService: InvoicesService,
    private readonly orderMail: OrderMailService,
    private readonly shippingService: ShippingService,
    private readonly labelService: LabelService,
  ) {}

  onModuleInit() {
    void this.expireAbandonedUnpaidOrders();
    this.expireTimer = setInterval(() => {
      void this.expireAbandonedUnpaidOrders();
    }, EXPIRE_SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.expireTimer) {
      clearInterval(this.expireTimer);
      this.expireTimer = null;
    }
  }

  /**
   * Cancela pedidos PENDING (status + pagamento) com mais de 1h e devolve
   * o estoque que tinha sido reservado na criação.
   */
  async expireAbandonedUnpaidOrders() {
    const cutoff = new Date(Date.now() - UNPAID_ORDER_TTL_MS);
    try {
      const stale = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: { lt: cutoff },
        },
        select: { id: true, storeId: true },
      });
      if (stale.length === 0) return 0;

      await this.prisma.order.updateMany({
        where: { id: { in: stale.map((o) => o.id) } },
        data: {
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.CANCELLED,
        },
      });

      for (const order of stale) {
        await this.restockOrderItems(order.storeId, order.id);
      }

      this.logger.log(
        `Expirados ${stale.length} pedido(s) sem pagamento (>1h); estoque devolvido`,
      );
      return stale.length;
    } catch (err) {
      this.logger.warn(
        `Falha ao expirar pedidos abandonados: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  /**
   * @param customerId null = compra sem cadastro (convidado). Nesse caso os
   * dados do comprador vêm do DTO e um Customer sem senha é criado/reusado.
   */
  async create(storeId: string, dto: CreateOrderDto, customerId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Pedido sem itens');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      throw new UnauthorizedException('Faça login para comprar');
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { storeId, id: { in: productIds }, active: true },
      include: { variants: { where: { active: true } } },
    });

    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('Um ou mais produtos são inválidos');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantIds = dto.items
      .map((i) => i.variantId)
      .filter((id): id is string => Boolean(id));
    const variantsLoaded =
      variantIds.length > 0
        ? await this.prisma.productVariant.findMany({
            where: { id: { in: variantIds }, active: true },
          })
        : [];
    const variantMap = new Map(variantsLoaded.map((v) => [v.id, v]));

    let subtotal = new Prisma.Decimal(0);
    const itemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException('Um ou mais produtos são inválidos');
      }

      if (product.hasVariants && !item.variantId) {
        throw new BadRequestException(
          `Selecione uma variação para: ${product.name}`,
        );
      }

      let variant = item.variantId ? variantMap.get(item.variantId) : undefined;
      if (item.variantId && !variant) {
        throw new BadRequestException(
          `Variação inválida para: ${product.name}`,
        );
      }
      if (variant && variant.productId !== product.id) {
        throw new BadRequestException(
          `Variação não pertence ao produto: ${product.name}`,
        );
      }
      // Fallback: variante já veio no include do produto
      if (!variant && item.variantId) {
        variant = product.variants.find((v) => v.id === item.variantId);
      }

      const unitPrice = variant?.price != null ? variant.price : product.price;
      const stockAvailable = variant ? variant.stock : product.stock;
      if (stockAvailable < item.quantity) {
        const label = variant
          ? `${product.name} (${variant.label})`
          : product.name;
        throw new BadRequestException(`Estoque insuficiente: ${label}`);
      }

      const total = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(total);

      const options =
        variant?.options && typeof variant.options === 'object'
          ? (variant.options as Prisma.InputJsonValue)
          : undefined;

      return {
        productId: product.id,
        variantId: variant?.id,
        productName: product.name,
        variantLabel: variant?.label ?? null,
        sku: variant?.sku || variant?.barcode || product.sku,
        unitPrice,
        quantity: item.quantity,
        total,
        attributes: options,
      };
    });

    // Endereço precisa ser resolvido antes do frete (o CEP alimenta a cotação)
    let shippingAddress = dto.shippingAddress;

    if (dto.addressId) {
      const addr = await this.prisma.address.findFirst({
        where: { id: dto.addressId, customerId: customer.id },
      });
      if (!addr) {
        throw new BadRequestException('Endereço inválido');
      }
      shippingAddress = {
        id: addr.id,
        zipCode: addr.zipCode,
        street: addr.street,
        number: addr.number,
        complement: addr.complement,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        label: addr.label,
      };
    }

    if (!shippingAddress?.zipCode || !shippingAddress?.street) {
      throw new BadRequestException('Informe o endereço de entrega');
    }

    // Frete sai SEMPRE da cotação do servidor. O que o cliente manda é só
    // qual opção ele escolheu — nunca o preço.
    const shipping = await this.resolveShipping(
      storeId,
      dto,
      itemsData,
      subtotal,
      shippingAddress,
    );
    let shippingCost = shipping.cost;
    const shippingMethod = shipping.method;
    const shippingServiceId = shipping.serviceId;

    let discount = new Prisma.Decimal(0);
    let couponId: string | undefined;
    let couponCode: string | undefined;

    if (dto.couponCode?.trim()) {
      const applied = await this.couponsService.applyToSubtotal(
        storeId,
        dto.couponCode,
        Number(subtotal),
      );
      discount = applied.discount;
      couponId = applied.coupon.id;
      couponCode = applied.coupon.code;
      if (applied.freeShipping) {
        shippingCost = new Prisma.Decimal(0);
      }
    }

    const total = subtotal.sub(discount).add(shippingCost);
    if (total.lessThan(0)) {
      throw new BadRequestException('Total inválido');
    }

    if (dto.saveAddress && !dto.addressId && shippingAddress) {
      const zipCode = String(shippingAddress.zipCode).replace(/\D/g, '');
      const count = await this.prisma.address.count({
        where: { customerId: customer.id },
      });
      if (count === 0) {
        await this.prisma.address.updateMany({
          where: { customerId: customer.id },
          data: { isDefault: false },
        });
      }
      await this.prisma.address.create({
        data: {
          customerId: customer.id,
          street: String(shippingAddress.street),
          number: String(shippingAddress.number || 's/n'),
          complement: shippingAddress.complement
            ? String(shippingAddress.complement)
            : null,
          neighborhood: String(shippingAddress.neighborhood || ''),
          city: String(shippingAddress.city || ''),
          state: String(shippingAddress.state || '')
            .toUpperCase()
            .slice(0, 2),
          zipCode,
          isDefault: count === 0,
        },
      });
    }

    if (dto.customerPhone?.trim() && dto.customerPhone !== customer.phone) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { phone: dto.customerPhone.trim() },
      });
    }
    if (dto.customerName?.trim() && dto.customerName !== customer.name) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { name: dto.customerName.trim() },
      });
    }

    const customerDocument = dto.customerDocument
      ? onlyDigits(dto.customerDocument) || null
      : customer.cpf
        ? onlyDigits(customer.cpf) || null
        : null;
    if (
      customerDocument &&
      customerDocument.length === 11 &&
      customerDocument !== customer.cpf
    ) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { cpf: customerDocument },
      });
    }

    const orderNumber = await this.nextOrderNumber(storeId);
    const customerName = dto.customerName?.trim() || customer.name;
    const customerEmail = customer.email;
    const customerPhone = dto.customerPhone?.trim() || customer.phone;

    const order = await this.prisma.$transaction(async (tx) => {
      // Estoque é RESERVADO aqui (decrementado de verdade) e devolvido se o
      // pedido expirar / for cancelado / estornado. Sem isso, N clientes
      // fechavam pedido do mesmo último item e todos pagavam — aí a baixa
      // falhava na aprovação e o cliente ficava pagando sem produto.
      await this.reserveStock(tx, storeId, itemsData);

      // Cupom só é consumido quando o pagamento for aprovado.
      return tx.order.create({
        data: {
          storeId,
          customerId: customer.id,
          orderNumber,
          customerName,
          customerEmail,
          customerPhone,
          customerDocument,
          shippingAddress: shippingAddress as Prisma.InputJsonValue,
          shippingMethod,
          shippingServiceId,
          shippingCost,
          subtotal,
          discount,
          total,
          couponId,
          couponCode,
          notes: dto.notes,
          stockReserved: true,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });

    // Confirmação de pedido recebido. Fora da transação e sem await: e-mail
    // que falha não pode derrubar um checkout já concluído.
    void this.orderMail.notifyOrder(order.id, 'received');

    return order;
  }

  /**
   * Recota o frete no servidor e devolve o preço da opção escolhida.
   * O `shippingCost` que vem do cliente é ignorado de propósito: aceitá-lo
   * deixava qualquer um fechar pedido com frete zero.
   */
  private async resolveShipping(
    storeId: string,
    dto: CreateOrderDto,
    items: {
      productId: string;
      variantId?: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }[],
    subtotal: Prisma.Decimal,
    shippingAddress: Record<string, unknown>,
  ): Promise<{
    cost: Prisma.Decimal;
    method: string | null;
    serviceId: string | null;
  }> {
    const zipCode =
      typeof shippingAddress.zipCode === 'string'
        ? shippingAddress.zipCode
        : String(shippingAddress.zipCode ?? '');

    let quoted: { options: ShipOption[] };
    try {
      quoted = await this.shippingService.quote(storeId, {
        zipCode,
        subtotal: Number(subtotal),
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          price: Number(item.unitPrice),
        })),
      });
    } catch (err) {
      // Erro de configuração da loja (CEP origem, token) já vem explicado
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Falha ao recotar frete (store=${storeId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        'Não foi possível confirmar o frete agora. Tente novamente em instantes.',
      );
    }

    const options = quoted.options || [];
    if (options.length === 0) {
      throw new BadRequestException(
        'Nenhuma opção de entrega disponível para este CEP.',
      );
    }

    const wantedId = dto.shippingOptionId?.trim();
    const wantedName = dto.shippingMethod?.trim();
    const chosen =
      (wantedId ? options.find((o) => o.id === wantedId) : undefined) ??
      (wantedName ? options.find((o) => o.name === wantedName) : undefined);

    if (!chosen) {
      throw new BadRequestException(
        'A opção de entrega escolhida não está mais disponível. Recalcule o frete e tente de novo.',
      );
    }

    return {
      cost: new Prisma.Decimal(chosen.price),
      method: chosen.name,
      // Sem o id do serviço não dá para emitir etiqueta depois
      serviceId: chosen.id,
    };
  }

  async list(storeId: string, query: OrderQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const where: Prisma.OrderWhereInput = {
      storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { customerName: { contains: query.q, mode: 'insensitive' } },
              { customerEmail: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getOne(storeId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, storeId },
      include: this.adminOrderInclude,
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }
    return order;
  }

  private readonly adminOrderInclude = {
    customer: true,
    items: {
      include: {
        product: {
          include: {
            images: {
              orderBy: { position: 'asc' as const },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.OrderInclude;

  async updateStatus(storeId: string, id: string, dto: UpdateOrderStatusDto) {
    const current = await this.getOne(storeId, id);

    const alreadyPaid =
      current.paymentStatus === PaymentStatus.APPROVED ||
      current.status === OrderStatus.PAID ||
      current.status === OrderStatus.PROCESSING ||
      current.status === OrderStatus.SHIPPED ||
      current.status === OrderStatus.DELIVERED;

    if (dto.status === OrderStatus.PENDING && alreadyPaid) {
      throw new BadRequestException(
        'Não é possível voltar um pedido pago para aguardando pagamento',
      );
    }

    if (
      dto.status === OrderStatus.PAID &&
      current.paymentStatus !== PaymentStatus.APPROVED
    ) {
      await this.fulfillPaidOrder(id, storeId);
      const data: Prisma.OrderUpdateInput & {
        trackingUrl?: string | null;
      } = {};
      if (dto.trackingCode !== undefined) {
        data.trackingCode = dto.trackingCode?.trim() || null;
      }
      if (dto.trackingUrl !== undefined) {
        data.trackingUrl = dto.trackingUrl?.trim() || null;
      }
      if (dto.carrierShipmentId !== undefined) {
        data.carrierShipmentId = dto.carrierShipmentId?.trim() || null;
      }
      if (Object.keys(data).length === 0) return this.getOne(storeId, id);
      await this.prisma.order.update({
        where: { id },
        data,
      });
      if (dto.trackingCode !== undefined) {
        await this.orderMail.notifyTrackingIfNew(id, current.trackingCode);
      }
      return this.getOne(storeId, id);
    }

    const data: Prisma.OrderUpdateInput & {
      trackingUrl?: string | null;
    } = {
      status: dto.status,
    };

    if (dto.trackingCode !== undefined) {
      data.trackingCode = dto.trackingCode?.trim() || null;
    }
    if (dto.trackingUrl !== undefined) {
      data.trackingUrl = dto.trackingUrl?.trim() || null;
    }
    if (dto.carrierShipmentId !== undefined) {
      data.carrierShipmentId = dto.carrierShipmentId?.trim() || null;
    }

    if (dto.status === OrderStatus.SHIPPED) {
      data.shippedAt = new Date();
    }
    if (dto.status === OrderStatus.DELIVERED) {
      data.deliveredAt = new Date();
      if (!current.shippedAt) data.shippedAt = new Date();
    }
    if (dto.status === OrderStatus.REFUNDED) {
      data.paymentStatus = PaymentStatus.REFUNDED;
      data.refundedAt = new Date();
      data.refundStatus = 'APPROVED';
    }

    await this.prisma.order.update({
      where: { id },
      data,
    });

    if (dto.trackingCode !== undefined) {
      await this.orderMail.notifyTrackingIfNew(id, current.trackingCode);
    }

    // Estorno e cancelamento devolvem o estoque reservado (a própria
    // restockOrderItems trava contra devolver duas vezes)
    if (
      (dto.status === OrderStatus.REFUNDED ||
        dto.status === OrderStatus.CANCELLED) &&
      current.status !== dto.status
    ) {
      await this.restockOrderItems(storeId, id);
    }

    return this.getOne(storeId, id);
  }

  /** Atualiza status de vários pedidos de uma vez (ex.: 50 → Entregue). */
  async bulkUpdateStatus(storeId: string, ids: string[], status: OrderStatus) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException('Selecione ao menos um pedido');
    }
    if (unique.length > 200) {
      throw new BadRequestException('Máximo 200 pedidos por vez');
    }
    if (status === OrderStatus.PENDING) {
      throw new BadRequestException(
        'Não é possível voltar pedidos em massa para aguardando pagamento',
      );
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status };
    if (status === OrderStatus.SHIPPED) {
      data.shippedAt = new Date();
    }
    if (status === OrderStatus.REFUNDED) {
      data.paymentStatus = PaymentStatus.REFUNDED;
      data.refundedAt = new Date();
      data.refundStatus = 'APPROVED';
    }

    const result = await this.prisma.order.updateMany({
      where: {
        storeId,
        id: { in: unique },
        ...(status === OrderStatus.DELIVERED
          ? {
              status: {
                in: [
                  OrderStatus.PAID,
                  OrderStatus.PROCESSING,
                  OrderStatus.SHIPPED,
                ],
              },
            }
          : {}),
        ...(status === OrderStatus.SHIPPED
          ? {
              status: {
                in: [OrderStatus.PAID, OrderStatus.PROCESSING],
              },
              paymentStatus: PaymentStatus.APPROVED,
            }
          : {}),
      },
      data,
    });

    if (status === OrderStatus.REFUNDED || status === OrderStatus.CANCELLED) {
      for (const id of unique) {
        await this.restockOrderItems(storeId, id).catch(() => undefined);
      }
    }

    return { updated: result.count, requested: unique.length, status };
  }

  /** Cliente confirma que recebeu — marca Entregue. */
  async confirmDeliveredByCustomer(
    storeId: string,
    customerId: string,
    orderId: string,
  ) {
    const order = await this.getForCustomer(storeId, customerId, orderId);
    if (order.status === OrderStatus.DELIVERED) return order;
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'Pedido não pode ser marcado como entregue',
      );
    }
    if (order.paymentStatus !== PaymentStatus.APPROVED) {
      throw new BadRequestException('Pedido ainda não foi pago');
    }
    if (
      order.status !== OrderStatus.SHIPPED &&
      order.status !== OrderStatus.PROCESSING &&
      order.status !== OrderStatus.PAID
    ) {
      throw new BadRequestException(
        'Status atual não permite confirmar entrega',
      );
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        shippedAt: order.shippedAt || new Date(),
      },
      include: this.customerOrderInclude,
    });
  }

  /**
   * Confirma compra após pagamento aprovado: baixa estoque + cupom (1x).
   * Idempotente se já estiver APPROVED/PAID.
   * Dispara impressão térmica automática (rede) quando configurada.
   */
  /**
   * Confirma o pagamento de um pedido. O estoque já foi reservado na criação,
   * então aqui não há baixa — só a marcação de pago, o cupom e os efeitos
   * colaterais (impressão, NFC-e).
   *
   * Idempotente por construção: o `updateMany` condicional é a trava. Webhook
   * duplicado do MP (ou webhook + retorno do Brick ao mesmo tempo) só passa
   * uma vez, então cupom e impressão nunca acontecem em dobro.
   */
  async fulfillPaidOrder(
    orderId: string,
    storeId: string,
    mpPaymentId?: string,
  ) {
    const before = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      select: { status: true, stockReserved: true },
    });
    if (!before) {
      throw new NotFoundException('Pedido não encontrado');
    }

    // Pagamento aprovado depois do pedido ter expirado/sido cancelado:
    // o estoque já voltou para a prateleira. Tenta reservar de novo para
    // reviver o pedido; se não der, registra o pagamento e deixa cancelado
    // para o lojista estornar (senão o cliente pagaria sem produto).
    if (before.status === OrderStatus.CANCELLED && !before.stockReserved) {
      const revived = await this.tryReviveCancelledOrder(orderId, storeId);
      if (!revived) {
        await this.prisma.order.updateMany({
          where: { id: orderId, storeId },
          data: {
            ...(mpPaymentId ? { mpPaymentId } : {}),
            paymentStatus: PaymentStatus.APPROVED,
          },
        });
        this.logger.error(
          `Pagamento aprovado para pedido cancelado sem estoque (order=${orderId}, store=${storeId}). Precisa de estorno manual.`,
        );
        return this.prisma.order.findFirstOrThrow({
          where: { id: orderId, storeId },
          include: { items: true },
        });
      }
    }

    const current = await this.prisma.order.findFirstOrThrow({
      where: { id: orderId, storeId },
      select: { status: true, couponId: true },
    });
    const nextStatus =
      current.status === OrderStatus.PENDING
        ? OrderStatus.PAID
        : current.status;

    const claimed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        storeId,
        paymentStatus: { not: PaymentStatus.APPROVED },
        paidAt: null,
      },
      data: {
        ...(mpPaymentId ? { mpPaymentId } : {}),
        paymentStatus: PaymentStatus.APPROVED,
        status: nextStatus,
        paidAt: new Date(),
      },
    });
    const firstApproval = claimed.count === 1;

    if (!firstApproval && mpPaymentId) {
      // Já estava aprovado — só garante que o id do pagamento ficou gravado
      await this.prisma.order.updateMany({
        where: { id: orderId, storeId, mpPaymentId: null },
        data: { mpPaymentId },
      });
    }

    if (firstApproval && current.couponId) {
      await this.prisma.$transaction(async (tx) => {
        await this.couponsService.incrementUsage(tx, current.couponId!);
      });
    }

    if (firstApproval) {
      void this.orderMail.notifyOrder(orderId, 'paid');
      void this.tryAutoNetworkPrint(storeId, orderId);
      void this.tryAutoIssueInvoice(storeId, orderId);
      void this.labelService.tryAutoGenerate(storeId, orderId);
    }

    return this.prisma.order.findFirstOrThrow({
      where: { id: orderId, storeId },
      include: { items: true },
    });
  }

  /** Tenta reservar de novo o estoque de um pedido cancelado que foi pago. */
  private async tryReviveCancelledOrder(orderId: string, storeId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true },
    });
    if (!order) return false;

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.reserveStock(
          tx,
          storeId,
          order.items
            .filter((item) => item.productId)
            .map((item) => ({
              productId: item.productId!,
              variantId: item.variantId ?? undefined,
              quantity: item.quantity,
              productName: item.productName,
              variantLabel: item.variantLabel,
            })),
        );
        await tx.order.update({
          where: { id: order.id },
          data: {
            stockReserved: true,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
          },
        });
      });
      this.logger.warn(
        `Pedido ${orderId} revivido: pagamento aprovado após expirar e estoque ainda disponível.`,
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Emite NFC-e após 1ª aprovação se a loja tiver nfeEnabled. */
  async tryAutoIssueInvoice(storeId: string, orderId: string) {
    try {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { nfeEnabled: true },
      });
      if (!store?.nfeEnabled) return;
      await this.invoicesService.issueForOrder(storeId, orderId);
      this.logger.log(`NFC-e emitida · pedido ${orderId}`);
    } catch (err) {
      this.logger.warn(
        `NFC-e automática falhou · pedido ${orderId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /**
   * Baixa o estoque dos itens (reserva). O decremento é condicional
   * (`stock >= quantidade`) para que duas compras simultâneas do último item
   * não passem as duas — quem perder a corrida recebe "estoque insuficiente".
   */
  private async reserveStock(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: {
      productId: string;
      variantId?: string;
      quantity: number;
      productName: string;
      variantLabel?: string | null;
    }[],
  ) {
    for (const item of items) {
      const label = item.variantLabel
        ? `${item.productName} (${item.variantLabel})`
        : item.productName;

      if (item.variantId) {
        const res = await tx.productVariant.updateMany({
          where: {
            id: item.variantId,
            productId: item.productId,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw new BadRequestException(`Estoque insuficiente: ${label}`);
        }
        await this.syncProductStockFromVariants(tx, item.productId);
      } else {
        const res = await tx.product.updateMany({
          where: {
            id: item.productId,
            storeId,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw new BadRequestException(`Estoque insuficiente: ${label}`);
        }
      }
    }
  }

  /**
   * Devolve o estoque reservado pelo pedido (cancelamento, expiração, estorno).
   * A flag `stockReserved` é apagada na mesma condição do update, então duas
   * chamadas simultâneas não devolvem o estoque em dobro.
   */
  async restockOrderItems(storeId: string, orderId: string) {
    // Compare-and-swap: só quem conseguir virar a flag devolve o estoque
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, storeId, stockReserved: true },
      data: { stockReserved: false },
    });
    if (claimed.count === 0) return;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true },
    });
    if (!order) return;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productId) continue;
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId, productId: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          await this.syncProductStockFromVariants(tx, item.productId);
        } else {
          await tx.product.updateMany({
            where: { id: item.productId, storeId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    });
  }

  private async syncProductStockFromVariants(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const variants = await tx.productVariant.findMany({
      where: { productId },
      select: { stock: true },
    });
    const stock = variants.reduce((sum, v) => sum + v.stock, 0);
    await tx.product.update({
      where: { id: productId },
      data: { stock, hasVariants: variants.length > 0 },
    });
  }

  /** Impressão automática na térmica de rede (sem abrir navegador). */
  async tryAutoNetworkPrint(storeId: string, orderId: string) {
    try {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
      });
      if (!store?.printerAutoPrint) return;
      if ((store.printerType || 'BROWSER') !== 'NETWORK') return;
      if (!store.printerHost?.trim()) {
        this.logger.warn(
          `Auto-print ativo na loja ${storeId}, mas IP da impressora não configurado`,
        );
        return;
      }
      await this.printOrder(storeId, orderId);
      this.logger.log(`Auto-print térmico OK · pedido ${orderId}`);
    } catch (err) {
      this.logger.warn(
        `Auto-print falhou · pedido ${orderId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private customerOrderInclude = {
    items: {
      include: {
        product: {
          select: { id: true, images: true, slug: true },
        },
      },
    },
  } as const;

  async listForCustomer(
    storeId: string,
    customerId: string,
    query?: Pick<OrderQueryDto, 'page' | 'limit'>,
  ) {
    // Limpa abandonados antes de listar (não depende só do cron)
    await this.expireAbandonedUnpaidOrders();

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit =
      query?.limit && query.limit > 0 ? Math.min(query.limit, 50) : 10;
    // Minhas compras: pagos + ainda aguardando pagamento (<1h). Sem cancelados.
    const where: Prisma.OrderWhereInput = {
      storeId,
      customerId,
      NOT: {
        OR: [
          { status: OrderStatus.CANCELLED },
          { paymentStatus: PaymentStatus.CANCELLED },
        ],
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: this.customerOrderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getForCustomer(storeId: string, customerId: string, orderId: string) {
    await this.expireAbandonedUnpaidOrders();
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId, customerId },
      include: this.customerOrderInclude,
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async requestRefund(
    storeId: string,
    customerId: string,
    orderId: string,
    reason?: string,
  ) {
    const order = await this.getForCustomer(storeId, customerId, orderId);

    if (order.paymentStatus !== PaymentStatus.APPROVED) {
      throw new BadRequestException(
        'Só é possível pedir reembolso de pedidos pagos',
      );
    }
    if (order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('Pedido já reembolsado');
    }
    if (order.refundStatus === 'REQUESTED') {
      throw new BadRequestException('Reembolso já solicitado');
    }
    if (order.refundStatus === 'APPROVED') {
      throw new BadRequestException('Reembolso já aprovado');
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        refundRequestedAt: new Date(),
        refundReason: reason?.trim() || null,
        refundStatus: 'REQUESTED',
      },
      include: this.customerOrderInclude,
    });
  }

  async listRefundRequests(storeId: string, onlyPending = true) {
    return this.prisma.order.findMany({
      where: {
        storeId,
        ...(onlyPending
          ? { refundStatus: 'REQUESTED' }
          : {
              OR: [
                { refundStatus: { not: null } },
                { status: OrderStatus.REFUNDED },
              ],
            }),
      },
      include: { items: true, customer: true },
      orderBy: [{ refundRequestedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async countPendingRefunds(storeId: string) {
    const pending = await this.prisma.order.count({
      where: { storeId, refundStatus: 'REQUESTED' },
    });
    return { pending };
  }

  /** Pedidos pagos ainda não enviados — precisam de ação no painel. */
  async countNewOrders(storeId: string) {
    const pending = await this.prisma.order.count({
      where: {
        storeId,
        status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING] },
      },
    });
    return { pending };
  }

  async rejectRefund(storeId: string, orderId: string, reason?: string) {
    const order = await this.getOne(storeId, orderId);
    if (order.refundStatus !== 'REQUESTED') {
      throw new BadRequestException('Não há solicitação pendente');
    }
    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        refundStatus: 'REJECTED',
        refundReason: reason?.trim() || order.refundReason,
      },
      include: { items: true },
    });
  }

  async getReceipt(storeId: string, id: string) {
    const order = await this.getOne(storeId, id);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const money = (v: Prisma.Decimal | number | string) =>
      Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const lines: ReceiptLine[] = [
      { text: store.name, align: 'center', bold: true },
      { text: `Pedido #${order.orderNumber}`, align: 'center', bold: true },
      {
        text: new Date(order.createdAt).toLocaleString('pt-BR'),
        align: 'center',
      },
      { text: '-'.repeat(32), align: 'center' },
      { text: `Cliente: ${order.customerName}` },
      { text: order.customerEmail },
    ];

    if (order.customerPhone)
      lines.push({ text: `Tel: ${order.customerPhone}` });
    lines.push({ text: '-'.repeat(32), align: 'center' });

    for (const item of order.items) {
      lines.push({
        text: `${item.quantity}x ${item.productName}`,
        bold: true,
      });
      if (item.sku?.trim()) {
        lines.push({ text: `Cod: ${item.sku.trim()}` });
      }
      lines.push({ text: money(item.total), align: 'right' });
    }

    lines.push({ text: '-'.repeat(32), align: 'center' });
    lines.push({ text: `Subtotal ${money(order.subtotal)}` });
    if (Number(order.discount) > 0) {
      lines.push({ text: `Desconto -${money(order.discount)}` });
    }
    if (Number(order.shippingCost) > 0) {
      lines.push({ text: `Frete ${money(order.shippingCost)}` });
    }
    lines.push({ text: `TOTAL ${money(order.total)}`, bold: true });
    lines.push({ text: `Pagamento: ${order.paymentStatus}` });
    lines.push({ text: `Status: ${order.status}` });
    lines.push({ text: '-'.repeat(32), align: 'center' });
    lines.push({ text: 'Obrigado pela compra!', align: 'center' });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      storeName: store.name,
      printerType: store.printerType,
      printerHost: store.printerHost,
      printerPort: store.printerPort,
      printerPaperWidth: store.printerPaperWidth,
      printerAutoPrint: store.printerAutoPrint,
      lines,
      html: this.receiptHtml(store.name, lines),
    };
  }

  async printOrder(storeId: string, id: string) {
    const order = await this.getOne(storeId, id);
    if (order.paymentStatus !== PaymentStatus.APPROVED) {
      throw new BadRequestException('Só é possível imprimir pedidos pagos');
    }
    const receipt = await this.getReceipt(storeId, id);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    if (store.printerType === 'NETWORK') {
      if (!store.printerHost) {
        throw new BadRequestException(
          'Configure o IP da impressora em Pedidos → Configurar impressora',
        );
      }
      const payload = this.printerService.buildEscPos(
        receipt.lines,
        store.printerPaperWidth || 80,
      );
      await this.printerService.sendNetwork(
        store.printerHost,
        store.printerPort || 9100,
        payload,
      );
      return { ok: true, mode: 'NETWORK', receipt };
    }

    return {
      ok: true,
      mode: store.printerType || 'BROWSER',
      receipt,
      message:
        store.printerType === 'BLUETOOTH'
          ? 'Use o app/navegador com Bluetooth ou imprima via sistema'
          : 'Abra a impressão do navegador / impressora USB instalada',
    };
  }

  private receiptHtml(storeName: string, lines: ReceiptLine[]) {
    const rows = lines
      .map((l) => {
        const align =
          l.align === 'center'
            ? 'center'
            : l.align === 'right'
              ? 'right'
              : 'left';
        const weight = l.bold ? '700' : '400';
        return `<div style="text-align:${align};font-weight:${weight};white-space:pre-wrap;word-break:break-word">${l.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</div>`;
      })
      .join('');
    const title = storeName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Recibo — ${title}</title>
<style>
  @page { margin: 4mm; size: 80mm auto; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    line-height: 1.35;
    width: 72mm;
    max-width: 100%;
    padding: 8px;
    color: #000;
    background: #fff;
  }
  @media print {
    body { width: 72mm; padding: 0; }
  }
</style>
</head><body>${rows}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 200);
  });
</script>
</body></html>`;
  }

  private async nextOrderNumber(storeId: string) {
    const count = await this.prisma.order.count({ where: { storeId } });
    return String(count + 1).padStart(6, '0');
  }
}
