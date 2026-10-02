import { MelhorEnvioOauthService } from './melhor-envio-oauth.service';
import { CARRIER_QUOTE_MODES } from './packaging';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/secrets/secrets.service';
import { QuoteShippingDto } from './dto/quote.dto';
import { quoteFrenet } from './providers/frenet.provider';
import { quoteMelhorEnvio } from './providers/melhor-envio.provider';
import { quoteSuperFrete } from './providers/superfrete.provider';
import {
  filterShipOptionsByCarriers,
  parseFreteTransportadoras,
} from './carriers';
import {
  defaultProducts,
  normalizeZip,
  type QuoteContext,
  type QuoteProduct,
  type ShipOption,
} from './providers/types';

/*
 * A cotação é pública: quem lê a mensagem de erro é o cliente da loja, na
 * página do produto ou no checkout. Instrução de configuração ("token",
 * "Configurações → Frete") não serve para ele; vai para o log, onde o
 * lojista e o suporte enxergam, e o cliente recebe o que fazer.
 */
const MSG_FRETE_INDISPONIVEL =
  'O cálculo de frete desta loja está indisponível no momento. Fale com a loja para combinar a entrega.';
const MSG_SEM_ENTREGA =
  'Não encontramos entrega para este CEP. Confira o número ou fale com a loja.';
const MSG_TENTE_DE_NOVO =
  'Não foi possível calcular o frete agora. Tente de novo em instantes.';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  /** Registra o motivo técnico para o lojista e devolve a mensagem do cliente. */
  private falhaParaCliente(
    storeId: string,
    motivo: string,
    mensagemCliente: string,
  ): never {
    this.logger.warn(`Frete da loja ${storeId}: ${motivo}`);
    throw new BadRequestException(mensagemCliente);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly meOauth: MelhorEnvioOauthService,
  ) {}

  async quote(storeId: string, dto: QuoteShippingDto) {
    const raw = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!raw) {
      throw new NotFoundException('Loja não encontrada');
    }
    const store = this.secrets.decryptStore(raw);

    const toZip = normalizeZip(dto.zipCode);
    if (toZip.length !== 8) {
      return { options: [] as ShipOption[], provider: store.freteModo };
    }

    const gratisAcimaRaw = store.freteGratisAcima
      ? Number(store.freteGratisAcima)
      : null;
    // 0 ou inválido = regra desligada (senão qualquer compra vira frete grátis)
    const gratisAcima =
      gratisAcimaRaw != null &&
      Number.isFinite(gratisAcimaRaw) &&
      gratisAcimaRaw > 0
        ? gratisAcimaRaw
        : null;
    const qualifiesFreeShipping =
      gratisAcima !== null && dto.subtotal >= gratisAcima;

    // Modo "sempre grátis" — sem cotação
    if (store.freteModo === 'gratis') {
      return {
        provider: store.freteModo,
        options: [
          {
            id: 'gratis',
            name: 'Frete grátis',
            price: 0,
            days: 7,
          },
        ] satisfies ShipOption[],
      };
    }

    if (
      store.freteModo === 'manual' ||
      !CARRIER_QUOTE_MODES.has(store.freteModo)
    ) {
      const options = this.manualOptions(store.freteValorFixo).map((o) =>
        qualifiesFreeShipping
          ? {
              ...o,
              id: `${o.id}-gratis`,
              name: `${o.name} (grátis acima de R$ ${gratisAcima.toFixed(2)})`,
              price: 0,
            }
          : o,
      );
      return {
        provider: 'manual',
        options,
      };
    }

    const fromZip = normalizeZip(store.freteCepOrigem || '');
    if (fromZip.length !== 8) {
      this.falhaParaCliente(
        storeId,
        'CEP de origem não configurado (Configurações → Frete)',
        MSG_FRETE_INDISPONIVEL,
      );
    }
    if (!store.freteToken?.trim()) {
      this.falhaParaCliente(
        storeId,
        'token da API de frete não configurado (Configurações → Frete)',
        MSG_FRETE_INDISPONIVEL,
      );
    }
    if (
      store.freteModo === 'melhor_envio' &&
      !store.freteEmailContato?.trim()
    ) {
      this.falhaParaCliente(
        storeId,
        'e-mail de contato exigido pelo Melhor Envio não informado',
        MSG_FRETE_INDISPONIVEL,
      );
    }

    const products = await this.resolveProducts(storeId, dto);
    const useSandbox = store.freteSandbox === true;

    /*
     * Loja conectada por OAuth tem token de 30 dias; aqui ele e renovado
     * quando esta perto de vencer. Quem ainda usa token colado na mao recebe
     * o proprio token de volta, sem mudanca de comportamento.
     */
    const token =
      (await this.meOauth.ensureFreshToken(storeId)) || store.freteToken;

    const ctx: QuoteContext = {
      fromZip,
      toZip,
      subtotal: dto.subtotal,
      products,
      token: token.trim(),
      sandbox: useSandbox,
      contactEmail: store.freteEmailContato?.trim() || undefined,
    };

    try {
      let options: ShipOption[] = [];
      if (store.freteModo === 'melhor_envio') {
        options = await quoteMelhorEnvio(ctx);
      } else if (store.freteModo === 'frenet') {
        options = await quoteFrenet(ctx);
      } else if (store.freteModo === 'superfrete') {
        options = await quoteSuperFrete(ctx);
      }

      const allowed = parseFreteTransportadoras(store.freteTransportadoras);
      if (allowed.length > 0) {
        options = filterShipOptionsByCarriers(options, allowed);
      }

      if (options.length === 0) {
        this.falhaParaCliente(
          storeId,
          allowed.length > 0
            ? `nenhuma das transportadoras escolhidas atende o CEP ${toZip} (libere mais opções em Configurações → Frete)`
            : `a API de frete não retornou opções para o CEP ${toZip} (verifique token, CEP de origem e cadastro)`,
          MSG_SEM_ENTREGA,
        );
      }

      // Frete grátis acima de X: ainda mostra as opções do ME, com preço zerado
      if (qualifiesFreeShipping && gratisAcima != null) {
        options = options.map((o) => ({
          ...o,
          price: 0,
          name: `${o.name} · grátis`,
        }));
      }

      return { provider: store.freteModo, sandbox: useSandbox, options };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.falhaParaCliente(
        storeId,
        `erro na API de frete: ${err instanceof Error ? err.message : String(err)}`,
        MSG_TENTE_DE_NOVO,
      );
    }
  }

  private async resolveProducts(
    storeId: string,
    dto: QuoteShippingDto,
  ): Promise<QuoteProduct[]> {
    const items = dto.items || [];
    if (items.length === 0) return defaultProducts(dto.subtotal);

    const ids = items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const variantIds = items
      .map((i) => i.variantId)
      .filter((id): id is string => Boolean(id));

    const products =
      ids.length > 0
        ? await this.prisma.product.findMany({
            where: { storeId, id: { in: ids } },
            select: {
              id: true,
              price: true,
              weightKg: true,
              widthCm: true,
              heightCm: true,
              lengthCm: true,
            },
          })
        : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    const variants =
      variantIds.length > 0
        ? await this.prisma.productVariant.findMany({
            where: {
              id: { in: variantIds },
              product: { storeId },
            },
            select: {
              id: true,
              productId: true,
              price: true,
              weightKg: true,
              widthCm: true,
              heightCm: true,
              lengthCm: true,
            },
          })
        : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    return items.map((item, i) => {
      const db = item.productId ? byId.get(item.productId) : undefined;
      const variant = item.variantId
        ? variantById.get(item.variantId)
        : undefined;

      // Preferência: payload → variação → produto → (provider usa default)
      const pickNum = (
        fromItem: number | undefined,
        fromVariant: unknown,
        fromProduct: unknown,
      ): number | undefined => {
        if (fromItem != null && Number.isFinite(Number(fromItem))) {
          return Number(fromItem);
        }
        if (fromVariant != null && fromVariant !== '') {
          const n = Number(fromVariant);
          if (Number.isFinite(n) && n > 0) return n;
        }
        if (fromProduct != null && fromProduct !== '') {
          const n = Number(fromProduct);
          if (Number.isFinite(n) && n > 0) return n;
        }
        return undefined;
      };

      return {
        id: item.variantId || item.productId || String(i + 1),
        quantity: Math.max(1, Math.floor(item.quantity)),
        price: item.price || Number(variant?.price ?? db?.price ?? 0),
        weight: pickNum(item.weight, variant?.weightKg, db?.weightKg),
        width: pickNum(item.width, variant?.widthCm, db?.widthCm),
        height: pickNum(item.height, variant?.heightCm, db?.heightCm),
        length: pickNum(item.length, variant?.lengthCm, db?.lengthCm),
      };
    });
  }

  /** Tabela própria da loja (não é cotação de transportadora). */
  private manualOptions(freteValorFixo: unknown): ShipOption[] {
    const freteFixo = Number(freteValorFixo ?? 25);
    return [
      {
        id: 'padrao',
        name: 'Entrega padrão',
        price: freteFixo,
        days: 10,
      },
      {
        id: 'expressa',
        name: 'Entrega expressa',
        price: Number((freteFixo * 1.6).toFixed(2)),
        days: 5,
      },
    ];
  }
}
