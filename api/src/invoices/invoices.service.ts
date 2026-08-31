import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceModel,
  InvoiceStatus,
  Prisma,
  SellerDocType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { onlyDigits } from '../stores/store-type';

/** NCM padrão quando o produto não tem NCM cadastrado (obrigatório na NFC-e). */
export const DEFAULT_NCM = '00000000';

type FocusNfceResponse = {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string | number;
  serie?: string | number;
  protocolo?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  mensagem?: string;
  erro?: string;
  [key: string]: unknown;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  async issueForOrder(storeId: string, orderId: string) {
    const storeRow = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!storeRow) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(storeRow);

    if (!store.nfeEnabled) {
      throw new BadRequestException('NFC-e não está habilitada nesta loja');
    }
    if (!store.nfeApiToken?.trim()) {
      throw new BadRequestException('Configure o token da API Focus NFe');
    }
    if (!store.sellerDocument || !store.sellerDocType) {
      throw new BadRequestException(
        'Cadastre CPF/CNPJ do lojista em Perfil da loja antes de emitir NFC-e',
      );
    }
    if (!store.sellerLegalName?.trim()) {
      throw new BadRequestException('Informe a razão social / nome do lojista');
    }
    if (
      !store.sellerZipCode ||
      !store.sellerStreet ||
      !store.sellerCity ||
      !store.sellerState
    ) {
      throw new BadRequestException(
        'Endereço fiscal do lojista incompleto (CEP, rua, cidade, UF)',
      );
    }

    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (
      existing &&
      (existing.status === InvoiceStatus.AUTHORIZED ||
        existing.status === InvoiceStatus.PENDING)
    ) {
      return existing;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: {
          include: {
            product: { select: { ncm: true, unit: true, cfop: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const ref = `order-${order.id}`;
    const baseUrl = this.focusBaseUrl(store.nfeEnvironment);

    // Só reserva depois de toda validação passar: erro de configuração da
    // loja não pode queimar número da sequência fiscal.
    const numero = await this.reserveInvoiceNumber(storeId);
    const payload = this.buildNfcePayload(store, order, numero);

    let invoice = existing
      ? await this.prisma.invoice.update({
          where: { id: existing.id },
          data: {
            status: InvoiceStatus.PENDING,
            providerRef: ref,
            payload: payload as Prisma.InputJsonValue,
            errorMessage: null,
            model: InvoiceModel.NFCE,
            series: store.nfeSeries || '1',
            number: numero,
          },
        })
      : await this.prisma.invoice.create({
          data: {
            storeId,
            orderId: order.id,
            model: InvoiceModel.NFCE,
            status: InvoiceStatus.PENDING,
            providerRef: ref,
            series: store.nfeSeries || '1',
            number: numero,
            payload: payload as Prisma.InputJsonValue,
          },
        });

    try {
      const auth = Buffer.from(`${store.nfeApiToken.trim()}:`).toString(
        'base64',
      );
      const res = await fetch(
        `${baseUrl}/v2/nfce?ref=${encodeURIComponent(ref)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const raw = await res.text();
      let body: FocusNfceResponse = {};
      try {
        body = JSON.parse(raw) as FocusNfceResponse;
      } catch {
        body = { mensagem: raw.slice(0, 500) };
      }

      const status = this.mapFocusStatus(body, res.ok);
      const xmlPath =
        typeof body.caminho_xml_nota_fiscal === 'string'
          ? body.caminho_xml_nota_fiscal
          : null;
      const pdfPath =
        typeof body.caminho_danfe === 'string' ? body.caminho_danfe : null;

      invoice = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status,
          accessKey:
            typeof body.chave_nfe === 'string' ? body.chave_nfe : undefined,
          protocol:
            typeof body.protocolo === 'string' ? body.protocolo : undefined,
          number:
            body.numero != null
              ? Number(body.numero)
              : (invoice.number ?? undefined),
          series:
            body.serie != null
              ? String(body.serie)
              : (invoice.series ?? undefined),
          xmlUrl: xmlPath ? `${baseUrl}${xmlPath}` : undefined,
          pdfUrl: pdfPath ? `${baseUrl}${pdfPath}` : undefined,
          issuedAt:
            status === InvoiceStatus.AUTHORIZED ? new Date() : undefined,
          errorMessage:
            status === InvoiceStatus.AUTHORIZED ||
            status === InvoiceStatus.PENDING
              ? null
              : String(
                  body.mensagem_sefaz ||
                    body.mensagem ||
                    body.erro ||
                    `Focus NFe HTTP ${res.status}`,
                ).slice(0, 2000),
          payload: {
            request: payload,
            response: body,
          } as Prisma.InputJsonValue,
        },
      });

      return invoice;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao emitir NFC-e pedido ${orderId}: ${message}`);
      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.ERROR,
          errorMessage: message.slice(0, 2000),
        },
      });
    }
  }

  async getInvoice(storeId: string, orderId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { storeId, orderId },
    });
    if (!invoice) throw new NotFoundException('Nota fiscal não encontrada');
    return invoice;
  }

  async cancelInvoice(
    storeId: string,
    orderId: string,
    justificativa = 'Cancelamento solicitado pelo lojista',
  ) {
    const storeRow = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!storeRow) throw new NotFoundException('Loja não encontrada');
    const store = this.secrets.decryptStore(storeRow);
    if (!store.nfeApiToken?.trim()) {
      throw new BadRequestException('Token Focus NFe não configurado');
    }

    const invoice = await this.getInvoice(storeId, orderId);
    if (invoice.status === InvoiceStatus.CANCELLED) return invoice;
    if (invoice.status !== InvoiceStatus.AUTHORIZED) {
      throw new BadRequestException('Só é possível cancelar NFC-e autorizada');
    }

    const ref = invoice.providerRef || `order-${orderId}`;
    const baseUrl = this.focusBaseUrl(store.nfeEnvironment);
    const auth = Buffer.from(`${store.nfeApiToken.trim()}:`).toString('base64');

    const res = await fetch(`${baseUrl}/v2/nfce/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        justificativa: justificativa.slice(0, 255),
      }),
    });

    const raw = await res.text();
    let body: FocusNfceResponse = {};
    try {
      body = JSON.parse(raw) as FocusNfceResponse;
    } catch {
      body = { mensagem: raw.slice(0, 500) };
    }

    if (!res.ok && body.status !== 'cancelado') {
      throw new BadRequestException(
        String(
          body.mensagem_sefaz ||
            body.mensagem ||
            body.erro ||
            `Cancelamento recusado (${res.status})`,
        ).slice(0, 400),
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        errorMessage: null,
        payload: {
          ...(typeof invoice.payload === 'object' && invoice.payload
            ? (invoice.payload as object)
            : {}),
          cancelResponse: body,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private focusBaseUrl(env?: string | null) {
    return env === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';
  }

  private mapFocusStatus(
    body: FocusNfceResponse,
    httpOk: boolean,
  ): InvoiceStatus {
    const s = String(body.status || '').toLowerCase();
    if (s === 'autorizado' || s === 'autorizada') {
      return InvoiceStatus.AUTHORIZED;
    }
    if (s === 'processando_autorizacao' || s === 'pendente') {
      return InvoiceStatus.PENDING;
    }
    if (s === 'erro_autorizacao' || s === 'denegado' || s === 'rejeitado') {
      return InvoiceStatus.REJECTED;
    }
    if (s === 'cancelado') return InvoiceStatus.CANCELLED;
    if (!httpOk) return InvoiceStatus.ERROR;
    return InvoiceStatus.PENDING;
  }

  /*
   * Reserva o próximo número da NFC-e de forma atômica.
   *
   * Antes o número era lido de store.nfeNextNumber para montar a nota e só
   * incrementado depois que a SEFAZ autorizava — com uma ida e volta HTTP no
   * meio. Dois pedidos pagos ao mesmo tempo pegavam o mesmo número e a
   * segunda nota era rejeitada, deixando pedido pago sem nota. E se a
   * resposta se perdesse depois da autorização, o incremento não acontecia e
   * a nota seguinte nascia com um número já usado, travando toda emissão
   * dali em diante.
   *
   * UPDATE ... RETURNING resolve em uma instrução só: quem chegar primeiro
   * leva o número, ninguém repete.
   *
   * Cada tentativa de transmissão queima um número, mesmo se falhar. É de
   * propósito: buraco na numeração se resolve com inutilização na SEFAZ,
   * número repetido não se resolve.
   */
  private async reserveInvoiceNumber(storeId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ nfeNextNumber: number }[]>`
      UPDATE "Store"
      SET "nfeNextNumber" = "nfeNextNumber" + 1
      WHERE id = ${storeId}
      RETURNING "nfeNextNumber"
    `;
    const proximo = rows[0]?.nfeNextNumber;
    if (proximo == null) {
      throw new NotFoundException('Loja não encontrada');
    }
    // o valor devolvido já é o próximo; o reservado é o anterior
    return Number(proximo) - 1;
  }

  private buildNfcePayload(
    store: {
      sellerDocType: SellerDocType | null;
      sellerDocument: string | null;
      sellerLegalName: string | null;
      sellerTradeName: string | null;
      sellerIe: string | null;
      sellerPhone: string | null;
      sellerEmail: string | null;
      sellerZipCode: string | null;
      sellerStreet: string | null;
      sellerNumber: string | null;
      sellerComplement: string | null;
      sellerNeighborhood: string | null;
      sellerCity: string | null;
      sellerState: string | null;
      nfeSeries: string;
      nfeNextNumber: number;
      nfeCscId: string | null;
      nfeCscToken: string | null;
      nfeEnvironment: string;
      name: string;
    },
    order: {
      orderNumber: string;
      total: Prisma.Decimal;
      customerName: string;
      customerDocument: string | null;
      customerEmail: string;
      shippingAddress: unknown;
      items: Array<{
        productName: string;
        sku: string | null;
        unitPrice: Prisma.Decimal;
        quantity: number;
        total: Prisma.Decimal;
        variantLabel: string | null;
        product: {
          ncm: string | null;
          unit: string;
          cfop: string | null;
        } | null;
      }>;
    },
    /** Número já reservado para esta transmissão. */
    numero: number,
  ) {
    const doc = onlyDigits(store.sellerDocument);
    const isCnpj = store.sellerDocType === SellerDocType.CNPJ;
    const emitenteKey = isCnpj ? 'cnpj_emitente' : 'cpf_emitente';

    const items = order.items.map((item, index) => {
      // NCM: usa o do produto; se ausente, DEFAULT_NCM (00000000) — SEFAZ pode rejeitar em produção.
      const ncm =
        onlyDigits(item.product?.ncm || '').slice(0, 8) || DEFAULT_NCM;
      const descricao = item.variantLabel
        ? `${item.productName} — ${item.variantLabel}`
        : item.productName;
      return {
        numero_item: index + 1,
        codigo_produto: item.sku || `ITEM${index + 1}`,
        descricao: descricao.slice(0, 120),
        codigo_ncm: ncm,
        cfop: item.product?.cfop || '5102',
        unidade_comercial: item.product?.unit || 'UN',
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: Number(item.unitPrice),
        valor_bruto: Number(item.total),
        unidade_tributavel: item.product?.unit || 'UN',
        quantidade_tributavel: item.quantity,
        valor_unitario_tributavel: Number(item.unitPrice),
        icms_origem: '0',
        icms_situacao_tributaria: '102',
      };
    });

    const total = Number(order.total);
    const payload: Record<string, unknown> = {
      natureza_operacao: 'VENDA AO CONSUMIDOR',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      local_destino: '1',
      finalidade_emissao: '1',
      consumidor_final: '1',
      presenca_comprador: '1',
      modalidade_frete: '9',
      [emitenteKey]: doc,
      nome_emitente: store.sellerLegalName,
      nome_fantasia_emitente: store.sellerTradeName || store.name,
      logradouro_emitente: store.sellerStreet,
      numero_emitente: store.sellerNumber || 'S/N',
      bairro_emitente: store.sellerNeighborhood || 'Centro',
      municipio_emitente: store.sellerCity,
      uf_emitente: (store.sellerState || '').toUpperCase().slice(0, 2),
      cep_emitente: onlyDigits(store.sellerZipCode).slice(0, 8),
      ...(store.sellerComplement
        ? { complemento_emitente: store.sellerComplement }
        : {}),
      ...(store.sellerIe
        ? { inscricao_estadual_emitente: store.sellerIe }
        : { inscricao_estadual_emitente: 'ISENTO' }),
      ...(store.sellerPhone
        ? { telefone_emitente: onlyDigits(store.sellerPhone) }
        : {}),
      ...(store.sellerEmail ? { email_emitente: store.sellerEmail } : {}),
      serie: store.nfeSeries || '1',
      numero,
      items,
      formas_pagamento: [
        {
          forma_pagamento: '99',
          valor_pagamento: total,
        },
      ],
      valor_produtos: total,
      valor_total: total,
    };

    if (store.nfeCscId && store.nfeCscToken) {
      payload.id_token = store.nfeCscId;
      payload.csc = store.nfeCscToken;
    }

    const destDoc = onlyDigits(order.customerDocument);
    if (destDoc.length === 11 || destDoc.length === 14) {
      if (destDoc.length === 11) payload.cpf_destinatario = destDoc;
      else payload.cnpj_destinatario = destDoc;
      payload.nome_destinatario = order.customerName;
    }

    if (store.nfeEnvironment !== 'producao') {
      payload.nome_destinatario =
        'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
    }

    return payload;
  }
}
