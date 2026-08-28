import {
  BadRequestException,
  Injectable,
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

const API_MODES = new Set(['melhor_envio', 'frenet', 'superfrete']);

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
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

    if (store.freteModo === 'manual' || !API_MODES.has(store.freteModo)) {
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
      throw new BadRequestException(
        'Configure o CEP de origem real da loja em Configurações → Frete',
      );
    }
    if (!store.freteToken?.trim()) {
      throw new BadRequestException(
        'Configure o token de produção da API de frete em Configurações → Frete',
      );
    }
    if (
      store.freteModo === 'melhor_envio' &&
      !store.freteEmailContato?.trim()
    ) {
      throw new BadRequestException(
        'Informe o e-mail de contato da loja (exigido pelo Melhor Envio)',
      );
    }

    const products = await this.resolveProducts(storeId, dto);
    const useSandbox = store.freteSandbox === true;

    const ctx: QuoteContext = {
      fromZip,
      toZip,
      subtotal: dto.subtotal,
      products,
      token: store.freteToken.trim(),
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
        throw new BadRequestException(
          allowed.length > 0
            ? 'Nenhuma transportadora selecionada atende este CEP. Libere mais opções em Configurações → Frete ou confira o CEP.'
            : 'A API de frete não retornou opções para este CEP. Verifique token, CEP de origem e cadastro na transportadora.',
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
      const msg = err instanceof Error ? err.message : 'Erro ao cotar frete';
      throw new BadRequestException(msg);
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
