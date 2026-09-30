import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { SecretsService } from '../common/secrets/secrets.service';
import { SweepRunner } from '../common/utils/sweep-runner';
import { Fila, TAREFAS } from '../fila/fila';
import { TravasService } from '../fila/travas.service';
import {
  comissaoRetida,
  lancamentosEsperados,
  type PagamentoMp,
} from '../platform-fee/livro';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoOauthService } from './mercadopago-oauth.service';

type TarefaConciliar = { storeId: string; paymentId: string };

/** Varredura de segurança: pega o que a fila deixou passar. */
const VARREDURA_MS = 60 * 60 * 1000;
/** Espera o webhook/fila agir antes de a varredura considerar esquecido. */
const FOLGA_MS = 15 * 60 * 1000;
/** Estornos e contestações chegam até ~180 dias depois da venda. */
const JANELA_MS = 200 * 24 * 60 * 60 * 1000;
const LOTE = 200;

/**
 * Conciliação da comissão: o que o Mercado Pago reteve de verdade vira
 * lançamento no livro (PlatformFeeEntry).
 *
 * Nunca confia no webhook: ele só diz "olhe o pagamento X". O valor sai da
 * consulta ao MP com o token da loja. Pode rodar quantas vezes for — as
 * chaves de idempotência descartam o repetido.
 */
@Injectable()
export class ConciliacaoComissaoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConciliacaoComissaoService.name);
  private readonly sweeper = new SweepRunner(
    () => this.travas.seLivre('comissao-conciliacao', () => this.varrer()),
    VARREDURA_MS,
    (err) =>
      this.logger.error(
        `Varredura da comissão falhou: ${err instanceof Error ? err.message : String(err)}`,
      ),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly mpOauth: MercadoPagoOauthService,
    private readonly fila: Fila,
    private readonly travas: TravasService,
  ) {}

  onModuleInit() {
    this.fila
      .trabalhar<TarefaConciliar>(TAREFAS.conciliarComissao, (d) =>
        this.conciliar(d.storeId, d.paymentId),
      )
      .catch((err) =>
        this.logger.error(
          `Não consegui ligar a fila da comissão: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.sweeper.start();
  }

  async onModuleDestroy() {
    await this.sweeper.stop();
  }

  /**
   * Pede a conciliação de um pagamento. Nunca lança: se a fila estiver fora,
   * a varredura de segurança pega depois.
   */
  async agendar(storeId: string, paymentId: string | number) {
    try {
      await this.fila.enviar<TarefaConciliar>(
        TAREFAS.conciliarComissao,
        { storeId, paymentId: String(paymentId) },
        { chaveUnica: `${storeId}:${paymentId}` },
      );
    } catch (err) {
      this.logger.warn(
        `Conciliação do pagamento ${paymentId} não entrou na fila: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Lê o pagamento no MP e grava no livro o que faltar. */
  async conciliar(storeId: string, paymentId: string): Promise<void> {
    await this.mpOauth.ensureFreshToken(storeId);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { mpAccessToken: true },
    });
    const token = this.secrets.decryptSafe(store?.mpAccessToken)?.trim();
    if (!token) return;

    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    // 404: pagamento não é desta loja — nada a conciliar, não adianta repetir
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status}`);
    const pagamento = (await res.json()) as PagamentoMp & {
      external_reference?: string;
    };

    const order = pagamento.external_reference
      ? await this.prisma.order.findFirst({
          where: { id: pagamento.external_reference, storeId },
          select: {
            id: true,
            platformFeeCents: true,
            platformFeeChargedCents: true,
            platformFeeMismatch: true,
          },
        })
      : null;
    if (!order) return;

    const jaLancados = new Set(
      (
        await this.prisma.platformFeeEntry.findMany({
          where: { mpPaymentId: String(pagamento.id) },
          select: { idempotencyKey: true },
        })
      ).map((e) => e.idempotencyKey),
    );
    const novos = lancamentosEsperados(pagamento, jaLancados).filter(
      (l) => !jaLancados.has(l.idempotencyKey),
    );

    const retida = comissaoRetida(pagamento);
    const aprovadoAlgumaVez = [
      'approved',
      'refunded',
      'charged_back',
      'in_mediation',
    ].includes(pagamento.status);
    const esperada = order.platformFeeCents ?? 0;
    const divergente = aprovadoAlgumaVez && Math.abs(retida - esperada) > 1;

    await this.prisma.$transaction([
      this.prisma.platformFeeEntry.createMany({
        data: novos.map((l) => ({
          storeId,
          orderId: order.id,
          type: l.type,
          amountCents: l.amountCents,
          mpPaymentId: l.mpPaymentId,
          idempotencyKey: l.idempotencyKey,
          note: l.note,
        })),
        skipDuplicates: true,
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: {
          ...(aprovadoAlgumaVez ? { platformFeeChargedCents: retida } : {}),
          ...(divergente ? { platformFeeMismatch: true } : {}),
        },
      }),
    ]);

    if (divergente && !order.platformFeeMismatch) {
      const msg = `Comissão divergente no pedido ${order.id} (pagamento ${pagamento.id}): esperada ${esperada} centavos, Mercado Pago reteve ${retida}`;
      this.logger.error(msg);
      Sentry.captureMessage(msg, 'error');
    }
  }

  /**
   * Rede de segurança: pedidos pagos com comissão que ainda não foram
   * conciliados, ou estornados sem o estorno da comissão no livro.
   */
  async varrer(): Promise<number> {
    const agora = Date.now();
    const pedidos = await this.prisma.order.findMany({
      where: {
        platformFeeCents: { gt: 0 },
        mpPaymentId: { not: null },
        updatedAt: {
          lt: new Date(agora - FOLGA_MS),
          gt: new Date(agora - JANELA_MS),
        },
        OR: [
          {
            paymentStatus: PaymentStatus.APPROVED,
            platformFeeChargedCents: null,
          },
          {
            paymentStatus: PaymentStatus.REFUNDED,
            platformFeeChargedCents: { gt: 0 },
            platformFeeEntries: {
              none: { type: { in: ['REFUND', 'CHARGEBACK'] } },
            },
          },
        ],
      },
      select: { storeId: true, mpPaymentId: true },
      orderBy: { updatedAt: 'asc' },
      take: LOTE,
    });
    for (const p of pedidos) {
      if (p.mpPaymentId) await this.agendar(p.storeId, p.mpPaymentId);
    }
    if (pedidos.length) {
      this.logger.log(
        `Varredura da comissão: ${pedidos.length} pagamento(s) para conciliar`,
      );
    }
    return pedidos.length;
  }
}
