import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  ) {}

  onModuleInit() {
    void this.sweep();
    this.timer = setInterval(() => {
      void this.sweep();
    }, SWEEP_MS);
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
