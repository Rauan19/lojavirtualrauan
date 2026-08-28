import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { buildMercadoPagoWebhookUrl } from '../common/utils/mercadopago-webhook-url';

type MpPayment = {
  id: number;
  status: string;
  external_reference?: string;
  transaction_amount_refunded?: number;
  transaction_amount?: number;
};

type InstallmentPayerCost = {
  installments: number;
  installment_rate?: number;
  installment_amount?: number;
  total_amount?: number;
  recommended_message?: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  /** URL pública do webhook (compra + reembolso), para exibir no painel. */
  getWebhookUrl() {
    return buildMercadoPagoWebhookUrl(this.config);
  }

  /**
   * URL que vai junto do pagamento. Carrega o storeId para o webhook saber
   * de qual loja é a notificação sem varrer todas.
   */
  private notificationUrl(storeId?: string): string | undefined {
    return buildMercadoPagoWebhookUrl(this.config, storeId) || undefined;
  }

  /** Remove null/undefined/'' — o MP devolve internal_error com campos vazios. */
  private stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        const nested = this.stripEmpty(value as Record<string, unknown>);
        if (Object.keys(nested).length === 0) continue;
        out[key] = nested;
        continue;
      }
      out[key] = value;
    }
    return out as Partial<T>;
  }

  /**
   * Brick às vezes manda identification vazia ou camelCase.
   * MP exige type+number juntos; senão responde internal_error sem cause.
   * Boleto exige address completo (zip_code, federal_unit, etc.).
   */
  private buildBrickPayer(
    payerFromBrick: Record<string, unknown>,
    fallbackEmail: string,
    fallbackName?: string | null,
    fallbackAddress?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const email =
      (typeof payerFromBrick.email === 'string' &&
        payerFromBrick.email.trim()) ||
      fallbackEmail;

    const firstName =
      (typeof payerFromBrick.first_name === 'string' &&
        payerFromBrick.first_name.trim()) ||
      (typeof payerFromBrick.firstName === 'string' &&
        payerFromBrick.firstName.trim()) ||
      (fallbackName || '').trim().split(/\s+/).filter(Boolean)[0] ||
      undefined;

    const lastName =
      (typeof payerFromBrick.last_name === 'string' &&
        payerFromBrick.last_name.trim()) ||
      (typeof payerFromBrick.lastName === 'string' &&
        payerFromBrick.lastName.trim()) ||
      (fallbackName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(1)
        .join(' ') ||
      undefined;

    const rawId =
      payerFromBrick.identification &&
      typeof payerFromBrick.identification === 'object' &&
      payerFromBrick.identification !== null
        ? (payerFromBrick.identification as Record<string, unknown>)
        : null;

    const idType =
      typeof rawId?.type === 'string' ? rawId.type.trim().toUpperCase() : '';
    const idNumber =
      rawId?.number != null ? String(rawId.number).replace(/\D/g, '') : '';

    const payer: Record<string, unknown> = { email };
    if (firstName) payer.first_name = firstName;
    if (lastName) payer.last_name = lastName;
    if (idType && idNumber && idType !== 'REGISTERED') {
      payer.identification = { type: idType, number: idNumber };
    }

    const entityType =
      typeof payerFromBrick.entity_type === 'string'
        ? payerFromBrick.entity_type.trim()
        : '';
    if (entityType) payer.entity_type = entityType;

    const address = this.buildPayerAddress(
      payerFromBrick.address,
      fallbackAddress,
    );
    if (address) payer.address = address;

    return payer;
  }

  /** Normaliza address do Brick ou do shippingAddress do pedido. */
  private buildPayerAddress(
    fromBrick: unknown,
    fromOrder?: Record<string, unknown> | null,
  ): Record<string, string> | null {
    const brick =
      fromBrick && typeof fromBrick === 'object' && fromBrick !== null
        ? (fromBrick as Record<string, unknown>)
        : null;
    const order = fromOrder || null;

    const pick = (...keys: string[]) => {
      for (const source of [brick, order]) {
        if (!source) continue;
        for (const key of keys) {
          const v = source[key];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
      return '';
    };

    const zipCode = pick('zip_code', 'zipCode').replace(/\D/g, '');
    let federalUnit = pick(
      'federal_unit',
      'federalUnit',
      'state',
    ).toUpperCase();
    if (federalUnit.length > 2) {
      const map: Record<string, string> = {
        BAHIA: 'BA',
        'SAO PAULO': 'SP',
        'RIO DE JANEIRO': 'RJ',
        'MINAS GERAIS': 'MG',
        PARANA: 'PR',
        'RIO GRANDE DO SUL': 'RS',
        'SANTA CATARINA': 'SC',
        GOIAS: 'GO',
        'DISTRITO FEDERAL': 'DF',
        PERNAMBUCO: 'PE',
        CEARA: 'CE',
        PARA: 'PA',
        'ESPIRITO SANTO': 'ES',
        AMAZONAS: 'AM',
        MARANHAO: 'MA',
        'MATO GROSSO': 'MT',
        'MATO GROSSO DO SUL': 'MS',
        PARAIBA: 'PB',
        'RIO GRANDE DO NORTE': 'RN',
        ALAGOAS: 'AL',
        PIAUI: 'PI',
        SERGIPE: 'SE',
        TOCANTINS: 'TO',
        RONDONIA: 'RO',
        ACRE: 'AC',
        AMAPA: 'AP',
        RORAIMA: 'RR',
      };
      const key = federalUnit
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/g, ' ');
      federalUnit = map[key] || federalUnit.slice(0, 2);
    }

    const city = pick('city', 'city_name');
    const neighborhood = pick('neighborhood', 'neighborhood_name');
    const streetName = pick('street_name', 'streetName', 'street');
    const streetNumber =
      pick('street_number', 'streetNumber', 'number') || 's/n';

    if (
      zipCode.length !== 8 ||
      !federalUnit ||
      !city ||
      !neighborhood ||
      !streetName
    ) {
      return null;
    }

    // /v1/payments NÃO aceita payer.address.complement (erro code 8)
    return {
      zip_code: zipCode,
      federal_unit: federalUnit.slice(0, 2),
      city,
      neighborhood,
      street_name: streetName,
      street_number: streetNumber,
    };
  }

  /**
   * Marca pedido como comprado: baixa estoque + cupom só na 1ª aprovação.
   * (Delega para OrdersService — inclui auto-print térmico.)
   */
  private async confirmPaidOrder(
    orderId: string,
    storeId: string,
    mpPaymentId: string,
  ) {
    return this.ordersService.fulfillPaidOrder(orderId, storeId, mpPaymentId);
  }

  private async loadOrderForPay(
    storeId: string,
    orderId: string,
    customerUserId?: string,
  ) {
    const rawStore = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    const store = rawStore ? this.secrets.decryptStore(rawStore) : null;
    if (!store?.mpAccessToken) {
      throw new BadRequestException('Mercado Pago não configurado nesta loja');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true, customer: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    // Cliente só paga o próprio pedido (user.id = customer.id no JWT da vitrine)
    if (customerUserId && order.customerId !== customerUserId) {
      throw new BadRequestException('Pedido não pertence a este cliente');
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.paymentStatus === PaymentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Este pedido expirou. Faça um novo checkout para pagar.',
      );
    }

    // Abandono > 1h: cancela na hora (estoque nunca foi baixado)
    if (
      order.status === OrderStatus.PENDING &&
      order.paymentStatus === PaymentStatus.PENDING
    ) {
      const ageMs = Date.now() - new Date(order.createdAt).getTime();
      if (ageMs > 60 * 60 * 1000) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.CANCELLED,
          },
        });
        // Devolve o estoque que estava reservado para este pedido
        await this.ordersService.restockOrderItems(storeId, order.id);
        throw new BadRequestException(
          'Este pedido expirou (1h sem pagamento). Faça um novo checkout.',
        );
      }
    }

    return { store, order };
  }

  private buildPreferenceItems(order: {
    items: {
      productName: string;
      quantity: number;
      unitPrice: unknown;
    }[];
    discount: unknown;
    shippingCost: unknown;
    shippingMethod: string | null;
  }) {
    const items = order.items.map((item) => ({
      title: item.productName,
      quantity: item.quantity,
      unit_price: Number(item.unitPrice),
      currency_id: 'BRL',
    }));

    if (Number(order.discount) > 0) {
      items.push({
        title: 'Desconto',
        quantity: 1,
        unit_price: -Number(order.discount),
        currency_id: 'BRL',
      });
    }

    if (Number(order.shippingCost) > 0) {
      items.push({
        title: order.shippingMethod
          ? `Frete (${order.shippingMethod})`
          : 'Frete',
        quantity: 1,
        unit_price: Number(order.shippingCost),
        currency_id: 'BRL',
      });
    }

    return items;
  }

  /** Inicia pagamento do cliente final (Brick personalizado por padrão). */
  async createPreference(
    storeId: string,
    orderId: string,
    customerUserId?: string,
  ) {
    const { store, order } = await this.loadOrderForPay(
      storeId,
      orderId,
      customerUserId,
    );
    const mode = store.checkoutMode === 'pro' ? 'pro' : 'personalized';
    const amount = Number(order.total);

    if (mode === 'personalized') {
      if (!store.mpPublicKey) {
        throw new BadRequestException(
          'Public Key do Mercado Pago é obrigatória no checkout personalizado',
        );
      }
      return {
        mode: 'personalized' as const,
        orderId: order.id,
        amount,
        publicKey: store.mpPublicKey,
        payerEmail: order.customerEmail,
        payerName: order.customerName,
      };
    }

    return this.createProPreference(store, order, amount);
  }

  private async createProPreference(
    store: {
      id: string;
      mpAccessToken: string | null;
      mpPublicKey: string | null;
    },
    order: {
      id: string;
      customerName: string;
      customerEmail: string;
      items: { productName: string; quantity: number; unitPrice: unknown }[];
      discount: unknown;
      shippingCost: unknown;
      shippingMethod: string | null;
    },
    amount: number,
  ) {
    const items = this.buildPreferenceItems(order);
    const notificationUrl = this.notificationUrl(store.id);
    const body: Record<string, unknown> = {
      external_reference: order.id,
      items,
      payer: {
        name: order.customerName,
        email: order.customerEmail,
      },
      metadata: {
        store_id: store.id,
        order_id: order.id,
      },
    };
    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    const response = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${store.mpAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro Mercado Pago: ${err}`);
    }

    const preference = (await response.json()) as {
      id: string;
      init_point: string;
      sandbox_init_point?: string;
    };

    await this.prisma.order.update({
      where: { id: order.id },
      data: { mpPreferenceId: preference.id },
    });

    return {
      mode: 'pro' as const,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      publicKey: store.mpPublicKey,
      /** true = credenciais de produção (usar initPoint, não sandbox). */
      liveMode: !String(store.mpPublicKey || '')
        .trim()
        .toUpperCase()
        .startsWith('TEST-'),
      amount,
      orderId: order.id,
    };
  }

  /** Pagamento via Payment Brick (cartão, Pix, boleto, conta MP). */
  async processBrickPayment(
    storeId: string,
    orderId: string,
    payload: Record<string, unknown>,
    customerUserId?: string,
  ) {
    const { store, order } = await this.loadOrderForPay(
      storeId,
      orderId,
      customerUserId,
    );
    const formData = (payload.formData as Record<string, unknown>) || payload;
    // Sempre o total do pedido no banco (2 casas) — não confiar no Brick.
    const amount = Math.round(Number(order.total) * 100) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor do pedido inválido para pagamento');
    }

    if (!formData.payment_method_id) {
      throw new BadRequestException(
        'Mercado Pago: payment_method_id ausente no formulário do Brick',
      );
    }

    const payerFromBrick =
      formData.payer &&
      typeof formData.payer === 'object' &&
      formData.payer !== null
        ? (formData.payer as Record<string, unknown>)
        : {};

    const paymentBody: Record<string, unknown> = this.stripEmpty({
      transaction_amount: amount,
      description: `Pedido ${order.orderNumber || order.id.slice(0, 12)}`,
      payment_method_id: formData.payment_method_id,
      payer: this.buildBrickPayer(
        payerFromBrick,
        order.customerEmail,
        order.customerName,
        order.shippingAddress &&
          typeof order.shippingAddress === 'object' &&
          !Array.isArray(order.shippingAddress)
          ? (order.shippingAddress as Record<string, unknown>)
          : null,
      ),
      external_reference: order.id,
      metadata: {
        store_id: storeId,
        order_id: order.id,
      },
    });

    // Cartão: token + parcelas + emissor
    if (formData.token) {
      paymentBody.token = formData.token;
      paymentBody.installments = Number(formData.installments || 1);
      if (formData.issuer_id != null && formData.issuer_id !== '') {
        const issuer = Number(formData.issuer_id);
        paymentBody.issuer_id = Number.isFinite(issuer)
          ? issuer
          : formData.issuer_id;
      }
    }

    const notificationUrl = this.notificationUrl(storeId);
    if (notificationUrl) {
      paymentBody.notification_url = notificationUrl;
    }

    const postPayment = async (body: Record<string, unknown>) => {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${store.mpAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `brick-${order.id}-${randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
      const errText = response.ok ? '' : await response.text();
      return { response, errText };
    };

    this.logger.log(
      `Brick pay order=${order.id} method=${String(formData.payment_method_id)} amount=${amount} hasToken=${Boolean(formData.token)} hasId=${Boolean((paymentBody.payer as Record<string, unknown>)?.identification)}`,
    );

    let { response, errText } = await postPayment(paymentBody);

    // ngrok free / URL inválida às vezes gera internal_error vazio — tenta sem webhook
    if (
      !response.ok &&
      errText.includes('internal_error') &&
      paymentBody.notification_url
    ) {
      this.logger.warn(
        `MP internal_error com notification_url; retry sem webhook (order=${order.id})`,
      );
      const { notification_url: _n, ...withoutWebhook } = paymentBody;
      ({ response, errText } = await postPayment(withoutWebhook));
    }

    if (!response.ok) {
      let friendly = errText.slice(0, 300);
      if (
        errText.includes('Unauthorized use of live credentials') ||
        errText.includes('"code":7')
      ) {
        let sellerHint = '';
        try {
          const meRes = await fetch('https://api.mercadopago.com/users/me', {
            headers: {
              Authorization: `Bearer ${store.mpAccessToken}`,
            },
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as {
              nickname?: string;
              tags?: string[];
            };
            if (me.tags?.includes('test_user')) {
              sellerHint = ` Seu Access Token é da conta ${me.nickname || 'TESTUSER'} (usuário de teste). `;
            }
          }
        } catch {
          /* ignore */
        }
        friendly =
          `${sellerHint}` +
          'O Brick/Checkout API não aceita Access Token gerado logando como TESTUSER. ' +
          'Faça login na conta REAL do vendedor → Developers → Suas integrações → seu app → ' +
          '"Credenciais de teste" → copie Public Key + Access Token desse bloco, salve no admin e teste de novo.';
      } else if (errText.includes('internal_error')) {
        friendly =
          'Erro interno do Mercado Pago (sem detalhe). Confira: (1) Public Key e Access Token do mesmo app/ambiente; ' +
          '(2) em teste use cartões oficiais do MP, não cartão real; (3) e-mail do comprador diferente da conta vendedor; ' +
          '(4) CPF válido no Brick. Resposta: ' +
          errText.slice(0, 180);
      }
      this.logger.warn(
        `MP recusou pay-brick order=${order.id}: ${errText.slice(0, 400)}`,
      );
      throw new BadRequestException(
        `Mercado Pago recusou o pagamento: ${friendly}`,
      );
    }

    const payment = (await response.json()) as {
      id: number;
      status: string;
      status_detail?: string;
      payment_method_id?: string;
      point_of_interaction?: {
        transaction_data?: {
          qr_code?: string;
          qr_code_base64?: string;
          ticket_url?: string;
          digitable_line?: string;
          barcode_content?: string;
        };
      };
      transaction_details?: {
        external_resource_url?: string;
        digitable_line?: string;
        barcode?: string;
        payment_method_reference_id?: string;
      };
    };

    const approved = payment.status === 'approved';
    if (approved) {
      await this.confirmPaidOrder(order.id, storeId, String(payment.id));
    } else {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          mpPaymentId: String(payment.id),
          paymentStatus:
            payment.status === 'rejected'
              ? PaymentStatus.REJECTED
              : PaymentStatus.PENDING,
        },
      });
    }

    const tx = payment.point_of_interaction?.transaction_data;
    const details = payment.transaction_details;
    const ticketUrl = tx?.ticket_url || details?.external_resource_url || null;
    const digitableLine = tx?.digitable_line || details?.digitable_line || null;
    // barcode_content (44) — não confundir com payment_method_reference_id curto
    let barcode = tx?.barcode_content || details?.barcode || null;
    if (barcode) {
      barcode = String(barcode).replace(/\D/g, '');
      if (barcode.length < 44) barcode = null;
      else barcode = barcode.slice(0, 44);
    }
    // Se só veio linha digitável, o front gera o código de barras

    this.logger.log(
      `Brick pay ok order=${order.id} status=${payment.status} method=${payment.payment_method_id || '?'} ticket=${Boolean(ticketUrl)} pix=${Boolean(tx?.qr_code)} boletoDigits=${Boolean(digitableLine || barcode)}`,
    );

    // Formato que o Brick usa pra tela de status / Pix / boleto
    return {
      id: payment.id,
      paymentId: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      statusDetail: payment.status_detail,
      orderId: order.id,
      approved,
      qrCode: tx?.qr_code || null,
      qrCodeBase64: tx?.qr_code_base64 || null,
      ticketUrl,
      digitableLine,
      barcode,
    };
  }

  /** Busca o pagamento no MP com o token de uma loja. null = não é dela. */
  private async fetchMpPayment(
    paymentId: string,
    accessToken: string,
  ): Promise<MpPayment | null> {
    try {
      const res = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      return (await res.json()) as MpPayment;
    } catch {
      return null;
    }
  }

  /** Casa pagamento + loja + pedido, se o pedido existir naquela loja. */
  private async matchOrder(
    paymentId: string,
    store: { id: string; mpAccessToken: string | null },
  ) {
    const accessToken = this.secrets.decryptSafe(store.mpAccessToken);
    if (!accessToken) return null;
    const payment = await this.fetchMpPayment(paymentId, accessToken);
    if (!payment?.external_reference) return null;

    const order = await this.prisma.order.findFirst({
      where: { id: payment.external_reference, storeId: store.id },
    });
    if (!order) return null;

    return { store, payment, order };
  }

  /**
   * Descobre de qual loja é a notificação.
   *
   * Caminho normal: o storeId vem na própria notification_url, então é 1
   * requisição ao MP. O fallback de varrer todas as lojas existe só para
   * webhooks cadastrados na mão no painel do MP (sem `?store=`) e fica caro
   * conforme a base cresce — daí o aviso no log.
   */
  private async resolvePaymentContext(paymentId: string, storeIdHint?: string) {
    if (storeIdHint) {
      const store = await this.prisma.store.findFirst({
        where: { id: storeIdHint, mpAccessToken: { not: null } },
        select: { id: true, mpAccessToken: true },
      });
      if (store) {
        const matched = await this.matchOrder(paymentId, store);
        if (matched) return matched;
      }
    }

    // Reenvio de uma notificação que já processamos: o pedido sabe a loja
    const known = await this.prisma.order.findFirst({
      where: { mpPaymentId: String(paymentId) },
      select: { store: { select: { id: true, mpAccessToken: true } } },
    });
    if (known?.store) {
      const matched = await this.matchOrder(paymentId, known.store);
      if (matched) return matched;
    }

    const stores = await this.prisma.store.findMany({
      where: { mpAccessToken: { not: null } },
      select: { id: true, mpAccessToken: true },
    });
    if (stores.length === 0) return null;

    this.logger.warn(
      `Webhook MP sem ?store= — varrendo ${stores.length} loja(s). Recadastre a URL do webhook com o parâmetro store para evitar isso.`,
    );

    // Em lotes para não serializar N chamadas à API do MP
    const BATCH = 8;
    for (let i = 0; i < stores.length; i += BATCH) {
      const results = await Promise.all(
        stores
          .slice(i, i + BATCH)
          .map((store) => this.matchOrder(paymentId, store)),
      );
      const hit = results.find((r) => r !== null);
      if (hit) return hit;
    }

    return null;
  }

  async handleWebhook(
    payload: {
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string };
      id?: string;
    },
    storeIdHint?: string,
  ) {
    const paymentId =
      payload?.data?.id ||
      (payload?.type === 'payment' || payload?.topic === 'payment'
        ? payload.id
        : undefined);

    if (!paymentId) {
      return { ok: true };
    }

    const context = await this.resolvePaymentContext(paymentId, storeIdHint);
    if (context) {
      const { store, payment, order } = context;

      // Reembolso total / chargeback confirmado no Mercado Pago
      if (payment.status === 'refunded' || payment.status === 'charged_back') {
        const wasRefunded =
          order.status === OrderStatus.REFUNDED ||
          order.paymentStatus === PaymentStatus.REFUNDED;
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            mpPaymentId: String(payment.id),
            status: OrderStatus.REFUNDED,
            paymentStatus: PaymentStatus.REFUNDED,
            refundStatus: 'APPROVED',
            refundedAt: order.refundedAt || new Date(),
          },
        });
        if (!wasRefunded) {
          await this.ordersService.restockOrderItems(store.id, order.id);
        }
        return {
          ok: true,
          orderId: order.id,
          approved: false,
          refunded: true,
        };
      }

      // Reembolso parcial: marca pedido se valor estornado >= total
      const refundedAmt = Number(payment.transaction_amount_refunded || 0);
      const totalAmt = Number(payment.transaction_amount || 0);
      if (
        payment.status === 'approved' &&
        refundedAmt > 0 &&
        totalAmt > 0 &&
        refundedAmt >= totalAmt - 0.01
      ) {
        const wasRefunded =
          order.status === OrderStatus.REFUNDED ||
          order.paymentStatus === PaymentStatus.REFUNDED;
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            mpPaymentId: String(payment.id),
            status: OrderStatus.REFUNDED,
            paymentStatus: PaymentStatus.REFUNDED,
            refundStatus: 'APPROVED',
            refundedAt: order.refundedAt || new Date(),
          },
        });
        if (!wasRefunded) {
          await this.ordersService.restockOrderItems(store.id, order.id);
        }
        return {
          ok: true,
          orderId: order.id,
          approved: false,
          refunded: true,
        };
      }

      const approved = payment.status === 'approved' && refundedAmt <= 0;
      if (approved) {
        await this.confirmPaidOrder(order.id, store.id, String(payment.id));
      } else if (
        payment.status === 'rejected' ||
        payment.status === 'cancelled'
      ) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            mpPaymentId: String(payment.id),
            paymentStatus: PaymentStatus.REJECTED,
          },
        });
      } else if (
        payment.status === 'pending' ||
        payment.status === 'in_process'
      ) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            mpPaymentId: String(payment.id),
            paymentStatus: PaymentStatus.PENDING,
          },
        });
      }

      return { ok: true, orderId: order.id, approved };
    }

    return { ok: true };
  }

  async refundOrder(storeId: string, orderId: string) {
    const rawStore = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!rawStore) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(rawStore);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (
      order.status === OrderStatus.REFUNDED ||
      order.paymentStatus === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException('Pedido já reembolsado');
    }

    const gateway: 'mercadopago' = 'mercadopago';
    let mpRefundId: string | null = null;
    let gatewayMessage = '';

    if (!store.mpAccessToken) {
      throw new BadRequestException(
        'Configure o Access Token do Mercado Pago em Configurações da loja para estornar de verdade',
      );
    }
    if (!order.mpPaymentId) {
      throw new BadRequestException(
        'Este pedido não tem payment id do Mercado Pago — não é possível estornar no gateway',
      );
    }

    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.mpPaymentId}/refunds`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${store.mpAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `refund-${order.id}`,
        },
        body: JSON.stringify({}),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(
        `Mercado Pago recusou o estorno: ${err.slice(0, 240)}`,
      );
    }

    const data = (await res.json()) as { id?: number | string };
    mpRefundId = data.id != null ? String(data.id) : null;
    gatewayMessage = 'Estorno enviado ao Mercado Pago com sucesso.';

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.REFUNDED,
        paymentStatus: PaymentStatus.REFUNDED,
        refundStatus: 'APPROVED',
        refundedAt: new Date(),
        mpRefundId: mpRefundId || undefined,
      },
      include: { items: true },
    });

    await this.ordersService.restockOrderItems(storeId, order.id);

    return {
      order: updated,
      gateway,
      gatewayMessage,
      mpRefundId,
    };
  }

  /**
   * Parcelas reais do Mercado Pago (API installments).
   * Mescla com "sem juros" da loja: até freeUntil divide o valor; acima usa taxa/valor do MP.
   */
  private async loadMpCreds(storeId: string) {
    const rawStore = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { mpAccessToken: true, mpPublicKey: true },
    });
    if (!rawStore) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(rawStore);
    return {
      token: store.mpAccessToken?.trim() || '',
      publicKey: store.mpPublicKey?.trim() || '',
    };
  }

  /** Busca as taxas do MP pra um valor (independe do free-until do produto). */
  private async fetchPayerCosts(
    storeId: string,
    creds: { token: string; publicKey: string },
    principal: number,
    method: string,
  ): Promise<{
    payerCosts: InstallmentPayerCost[];
    source: 'mercadopago' | 'unavailable';
    gatewayMessage: string;
  }> {
    const { token, publicKey } = creds;
    if (!token && !publicKey) {
      return {
        payerCosts: [],
        source: 'unavailable',
        gatewayMessage: 'Configure Mercado Pago na loja para ver juros reais',
      };
    }

    const qs = new URLSearchParams({
      amount: principal.toFixed(2),
      payment_method_id: method,
      locale: 'pt-BR',
    });
    if (publicKey) qs.set('public_key', publicKey);

    try {
      const res = await fetch(
        `https://api.mercadopago.com/v1/payment_methods/installments?${qs}`,
        {
          method: 'GET',
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : { 'Content-Type': 'application/json' },
        },
      );
      if (res.ok) {
        const raw = (await res.json()) as Array<{
          payer_costs?: InstallmentPayerCost[];
        }>;
        const list = Array.isArray(raw) ? raw : [];
        // Preferir o issuer com mais opções (tabela mais completa)
        const payerCosts = list.reduce<InstallmentPayerCost[]>((best, row) => {
          const costs = row.payer_costs || [];
          return costs.length > best.length ? costs : best;
        }, []);
        return { payerCosts, source: 'mercadopago', gatewayMessage: '' };
      }
      const err = await res.text();
      const gatewayMessage = `MP installments: ${err.slice(0, 160)}`;
      this.logger.warn(
        `installments fail store=${storeId} status=${res.status} ${gatewayMessage}`,
      );
      return { payerCosts: [], source: 'unavailable', gatewayMessage };
    } catch (err) {
      const gatewayMessage =
        err instanceof Error ? err.message : 'Falha ao consultar MP';
      this.logger.warn(
        `installments error store=${storeId}: ${gatewayMessage}`,
      );
      return { payerCosts: [], source: 'unavailable', gatewayMessage };
    }
  }

  private buildInstallmentOptions(
    principal: number,
    freeUntil: number,
    payerCosts: InstallmentPayerCost[],
    source: 'mercadopago' | 'unavailable',
    gatewayMessage: string,
    method: string,
  ) {
    const freeMax = Math.min(12, Math.max(0, Math.floor(freeUntil || 0)));

    const byN = new Map<number, InstallmentPayerCost>();
    for (const c of payerCosts) {
      const n = Number(c.installments);
      if (!Number.isFinite(n) || n < 1) continue;
      byN.set(n, c);
    }

    const maxFromMp = Math.max(0, ...Array.from(byN.keys()));
    const maxN = Math.max(freeMax, maxFromMp, 1);

    const options: Array<{
      count: number;
      installmentAmount: number;
      totalAmount: number;
      interestFree: boolean;
      installmentRate: number;
      recommendedMessage?: string;
      source: 'store_offer' | 'mercadopago';
    }> = [];

    for (let n = 1; n <= Math.min(12, maxN); n++) {
      if (n === 1) {
        options.push({
          count: 1,
          installmentAmount: principal,
          totalAmount: principal,
          interestFree: true,
          installmentRate: 0,
          source: 'store_offer',
        });
        continue;
      }

      // Oferta da loja: sem juros até freeMax (lojista absorve)
      if (n <= freeMax) {
        options.push({
          count: n,
          installmentAmount: Number((principal / n).toFixed(2)),
          totalAmount: principal,
          interestFree: true,
          installmentRate: 0,
          source: 'store_offer',
        });
        continue;
      }

      const mp = byN.get(n);
      if (!mp) continue;

      const installmentAmount = Number(mp.installment_amount ?? principal / n);
      const totalAmount = Number(mp.total_amount ?? installmentAmount * n);
      const rate = Number(mp.installment_rate ?? 0);
      options.push({
        count: n,
        installmentAmount,
        totalAmount,
        interestFree: rate <= 0,
        installmentRate: rate,
        recommendedMessage: mp.recommended_message,
        source: 'mercadopago',
      });
    }

    return {
      amount: principal,
      freeUntil: freeMax,
      paymentMethodId: method,
      source,
      gatewayMessage: gatewayMessage || undefined,
      options,
    };
  }

  async getInstallments(
    storeId: string,
    amount: number,
    freeUntil = 0,
    paymentMethodId = 'visa',
  ) {
    const principal = Number(amount);
    if (!Number.isFinite(principal) || principal < 1) {
      throw new BadRequestException('Valor inválido para parcelas');
    }
    const method = (paymentMethodId || 'visa').toLowerCase().trim() || 'visa';
    const creds = await this.loadMpCreds(storeId);
    const { payerCosts, source, gatewayMessage } = await this.fetchPayerCosts(
      storeId,
      creds,
      principal,
      method,
    );
    return this.buildInstallmentOptions(
      principal,
      freeUntil,
      payerCosts,
      source,
      gatewayMessage,
      method,
    );
  }

  /**
   * Mesma lógica, mas pra um lote de produtos de uma vez — evita 1 request
   * por card na vitrine. Deduplica a consulta ao MP por valor (o freeUntil
   * de cada produto só entra depois, no cálculo local das opções).
   */
  async getInstallmentsBatch(
    storeId: string,
    items: Array<{ id: string; amount: number; freeUntil?: number }>,
    paymentMethodId = 'visa',
  ) {
    const method = (paymentMethodId || 'visa').toLowerCase().trim() || 'visa';
    const capped = items.slice(0, 60).filter((i) => {
      const n = Number(i.amount);
      return i.id && Number.isFinite(n) && n >= 1;
    });

    const creds = await this.loadMpCreds(storeId);

    const uniqueAmounts = Array.from(
      new Set(capped.map((i) => Number(i.amount).toFixed(2))),
    );

    const rateByAmount = new Map<
      string,
      {
        payerCosts: InstallmentPayerCost[];
        source: 'mercadopago' | 'unavailable';
        gatewayMessage: string;
      }
    >();

    // Concorrência limitada pra não estourar o rate limit do MP.
    const chunkSize = 6;
    for (let i = 0; i < uniqueAmounts.length; i += chunkSize) {
      const chunk = uniqueAmounts.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((key) =>
          this.fetchPayerCosts(storeId, creds, Number(key), method),
        ),
      );
      chunk.forEach((key, idx) => rateByAmount.set(key, results[idx]));
    }

    const byId: Record<
      string,
      ReturnType<PaymentsService['buildInstallmentOptions']>
    > = {};
    for (const item of capped) {
      const key = Number(item.amount).toFixed(2);
      const rates = rateByAmount.get(key);
      if (!rates) continue;
      byId[item.id] = this.buildInstallmentOptions(
        Number(item.amount),
        item.freeUntil ?? 0,
        rates.payerCosts,
        rates.source,
        rates.gatewayMessage,
        method,
      );
    }

    return byId;
  }
}
