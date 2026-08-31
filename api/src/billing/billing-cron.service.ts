import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import {
  BILLING_METHOD,
  decidirCobrancaPix,
  deveLembrar,
} from './pix-billing-rules';
import { BillingMailService } from '../mail/billing-mail.service';

/** Varre de hora em hora — a régua é diária, mas assim o restart não atrasa. */
const SWEEP_MS = 60 * 60 * 1000;

/** Dias de tolerância entre o vencimento e a suspensão da loja. */
const DEFAULT_GRACE_DAYS = 7;

/**
 * Régua de cobrança da plataforma.
 *
 * Antes disso o vencimento só era percebido quando o lojista abria a tela de
 * planos — quem nunca abria ficava ACTIVE para sempre, de graça.
 */
@Injectable()
export class BillingCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly billingMail: BillingMailService,
  ) {}

  onModuleInit() {
    void this.rodar();
    this.timer = setInterval(() => {
      void this.rodar();
    }, SWEEP_MS);
  }

  /*
   * Cobrar vem antes de punir: gerar a cobrança do ciclo primeiro dá ao
   * lojista a chance de pagar antes de a régua marcá-lo em atraso.
   */
  private async rodar() {
    await this.emitirCobrancasPix();
    await this.lembrarVencidas();
    await this.sweep();
  }

  /**
   * Um lembrete por fatura vencida e não paga.
   *
   * Roda antes da régua de propósito: avisar depois de suspender a loja é
   * avisar tarde demais.
   */
  async lembrarVencidas() {
    try {
      const vencidas = await this.prisma.platformInvoice.findMany({
        where: {
          method: BILLING_METHOD.PIX,
          status: PaymentStatus.PENDING,
          pixLembreteEm: null,
          dueAt: { not: null },
        },
        select: { id: true, dueAt: true, pixLembreteEm: true },
      });

      let enviados = 0;
      for (const f of vencidas) {
        if (!deveLembrar({ dueAt: f.dueAt, lembreteEnviadoEm: f.pixLembreteEm })) {
          continue;
        }
        /*
         * Marca antes de enviar: se o processo cair no meio, o lojista fica
         * sem um lembrete — melhor que receber o mesmo aviso a cada hora até
         * alguém perceber.
         */
        const marcou = await this.prisma.platformInvoice.updateMany({
          where: { id: f.id, pixLembreteEm: null },
          data: { pixLembreteEm: new Date() },
        });
        if (marcou.count === 0) continue;

        await this.billingMail.notificar(f.id, 'pix_vencendo');
        enviados++;
      }

      if (enviados > 0) {
        this.logger.log(`Mensalidade Pix: ${enviados} lembrete(s) enviado(s)`);
      }
      return { enviados };
    } catch (err) {
      this.logger.error(
        `Falha ao enviar lembretes de mensalidade: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { enviados: 0 };
    }
  }

  /**
   * Mensalidade por Pix: o Mercado Pago não faz recorrência em Pix, então o
   * ciclo é nosso — a cada mês esta varredura cria a cobrança de quem está
   * perto de vencer.
   */
  async emitirCobrancasPix() {
    try {
      const lojas = await this.prisma.store.findMany({
        where: { billingMethod: BILLING_METHOD.PIX },
        select: {
          id: true,
          billingMethod: true,
          status: true,
          planDueAt: true,
        },
      });
      if (lojas.length === 0) return { geradas: 0 };

      let geradas = 0;
      for (const loja of lojas) {
        const aberta = await this.prisma.platformInvoice.findFirst({
          where: {
            storeId: loja.id,
            method: BILLING_METHOD.PIX,
            status: PaymentStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          select: { pixExpiresAt: true },
        });

        const decisao = decidirCobrancaPix({ loja, cobrancaAberta: aberta });
        if (!decisao.gerar) continue;

        try {
          await this.billing.emitirCobrancaPix(loja.id);
          geradas++;
        } catch (err) {
          // uma loja com cadastro incompleto não pode travar a varredura
          this.logger.warn(
            `Não foi possível gerar o Pix da loja ${loja.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (geradas > 0) {
        this.logger.log(`Mensalidade Pix: ${geradas} cobrança(s) gerada(s)`);
      }
      return { geradas };
    } catch (err) {
      this.logger.error(
        `Falha ao gerar cobranças Pix: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { geradas: 0 };
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private graceDays(): number {
    const raw = Number(this.config.get<string>('BILLING_GRACE_DAYS'));
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_DAYS;
  }

  /**
   * 1) Venceu e ainda está ACTIVE/TRIAL  → PAST_DUE (painel some, vitrine fica)
   * 2) PAST_DUE além da carência         → SUSPENDED (loja sai do ar)
   */
  async sweep() {
    try {
      const now = new Date();

      const pastDue = await this.prisma.store.updateMany({
        where: {
          status: { in: [StoreStatus.ACTIVE, StoreStatus.TRIAL] },
          planDueAt: { not: null, lte: now },
        },
        data: { status: StoreStatus.PAST_DUE },
      });

      const suspendCutoff = new Date(
        now.getTime() - this.graceDays() * 24 * 60 * 60 * 1000,
      );
      const suspended = await this.prisma.store.updateMany({
        where: {
          status: StoreStatus.PAST_DUE,
          planDueAt: { not: null, lte: suspendCutoff },
        },
        data: { status: StoreStatus.SUSPENDED },
      });

      if (pastDue.count > 0 || suspended.count > 0) {
        this.logger.log(
          `Régua de cobrança: ${pastDue.count} loja(s) em atraso, ${suspended.count} suspensa(s)`,
        );
      }

      return { pastDue: pastDue.count, suspended: suspended.count };
    } catch (err) {
      this.logger.error(
        `Falha na régua de cobrança: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { pastDue: 0, suspended: 0 };
    }
  }
}
