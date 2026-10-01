import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { endpointDePushValido } from './push-endpoint';

export type Inscricao = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device?: string;
};

type Aviso = { title: string; body: string; url: string; tag?: string };

function reais(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * "Você vendeu!" no celular do lojista (Web Push, sem app de loja e sem
 * custo: o envio passa pelo serviço de push do próprio navegador).
 *
 * Sem as chaves VAPID no .env, tudo aqui vira nada: a venda segue normal,
 * só não avisa.
 */
@Injectable()
export class AvisosService {
  private readonly logger = new Logger(AvisosService.name);
  private readonly ativo: boolean;
  private readonly chavePublicaVapid: string | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const publica = config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privada = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const front = config.get<string>('FRONTEND_URL')?.trim() || '';
    // O serviço de push exige um contato: e-mail ou o site (https)
    const contato =
      config.get<string>('VAPID_SUBJECT')?.trim() ||
      (front.startsWith('https://') ? front : 'mailto:avisos@localhost');
    this.ativo = Boolean(publica && privada);
    this.chavePublicaVapid = this.ativo ? publica! : null;
    if (this.ativo) {
      try {
        webpush.setVapidDetails(contato, publica!, privada!);
      } catch (e) {
        this.ativo = false;
        this.chavePublicaVapid = null;
        this.logger.warn(
          `Chaves VAPID inválidas; avisos no celular desligados: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  async painel(userId: string) {
    const aparelhos = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, device: true, createdAt: true, endpoint: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      disponivel: this.ativo,
      chavePublica: this.chavePublicaVapid,
      aparelhos: aparelhos.map((a) => ({
        id: a.id,
        nome: a.device || 'Navegador',
        desde: a.createdAt,
        endpoint: a.endpoint,
      })),
    };
  }

  async inscrever(userId: string, storeId: string, dto: Inscricao) {
    if (!this.ativo) {
      throw new BadRequestException(
        'Avisos no celular ainda não estão ligados nesta plataforma.',
      );
    }
    if (!endpointDePushValido(dto.endpoint)) {
      throw new BadRequestException('Navegador não suportado para avisos.');
    }
    const dados = {
      userId,
      storeId,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      device: dto.device?.slice(0, 80) || null,
    };
    // O mesmo aparelho inscrito de novo (ou passado para outra pessoa da
    // equipe) troca de dono em vez de duplicar
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...dados },
      update: dados,
    });
    return this.painel(userId);
  }

  async cancelar(userId: string, endpointOuId: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, OR: [{ endpoint: endpointOuId }, { id: endpointOuId }] },
    });
    return this.painel(userId);
  }

  async testar(userId: string) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subs.length === 0) {
      throw new BadRequestException('Nenhum aparelho com avisos ligados.');
    }
    const enviados = await this.enviar(subs, {
      title: 'Avisos ligados!',
      body: 'É assim que você vai saber de cada venda.',
      url: '/admin/orders',
      tag: 'teste',
    });
    return { enviados };
  }

  /**
   * Pagamento aprovado: avisa o dono e quem da equipe cuida de pedidos.
   * Nunca lança: falha de aviso não pode atrapalhar a venda.
   */
  async vendaAprovada(storeId: string, orderId: string) {
    if (!this.ativo) return 0;
    try {
      const pedido = await this.prisma.order.findFirst({
        where: { id: orderId, storeId },
        select: {
          orderNumber: true,
          total: true,
          customerName: true,
          _count: { select: { items: true } },
        },
      });
      if (!pedido) return 0;
      const equipe = await this.prisma.user.findMany({
        where: {
          storeId,
          role: 'STORE_ADMIN',
          active: true,
          OR: [{ storeOwner: true }, { permissions: { has: 'pedidos' } }],
        },
        select: { id: true },
      });
      const subs = await this.prisma.pushSubscription.findMany({
        where: { storeId, userId: { in: equipe.map((u) => u.id) } },
      });
      if (subs.length === 0) return 0;
      const nome = pedido.customerName.trim().split(/\s+/)[0] || 'Cliente';
      const itens = pedido._count.items;
      return await this.enviar(subs, {
        title: `Você vendeu! ${reais(Number(pedido.total))}`,
        body: `Pedido #${pedido.orderNumber} · ${itens} ${itens === 1 ? 'item' : 'itens'} · ${nome}`,
        url: `/admin/orders?pedido=${orderId}`,
        tag: `pedido-${orderId}`,
      });
    } catch (e) {
      this.logger.warn(
        `Aviso de venda não saiu (${orderId}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return 0;
    }
  }

  /** O envio de fato, pelo serviço de push do navegador (separado para teste). */
  entregar(
    s: { endpoint: string; p256dh: string; auth: string },
    corpo: string,
  ) {
    return webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      corpo,
      { TTL: 60 * 60 * 24, urgency: 'high', timeout: 10_000 },
    );
  }

  private async enviar(
    subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
    aviso: Aviso,
  ) {
    const corpo = JSON.stringify(aviso);
    let enviados = 0;
    await Promise.all(
      subs.map(async (s) => {
        // Inscrição antiga com endereço fora da lista não recebe nada
        if (!endpointDePushValido(s.endpoint)) return;
        try {
          await this.entregar(s, corpo);
          enviados++;
          await this.prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastSentAt: new Date() },
          });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: o navegador desinscreveu (app desinstalado, permissão tirada)
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
          } else {
            this.logger.warn(
              `Push falhou (${status ?? 'rede'}) para ${new URL(s.endpoint).hostname}`,
            );
          }
        }
      }),
    );
    return enviados;
  }
}
