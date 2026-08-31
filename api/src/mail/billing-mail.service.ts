import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { buildBillingEmail, type BillingMailKind } from './billing-email';

/*
 * Avisos da mensalidade da plataforma para o lojista.
 *
 * Nunca lança: e-mail que falha não pode derrubar a geração da cobrança nem o
 * webhook de pagamento — a fatura já é válida sem o aviso.
 */
@Injectable()
export class BillingMailService {
  private readonly logger = new Logger(BillingMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private brandName() {
    return this.config.get<string>('PLATFORM_BRAND_NAME')?.trim() || 'Vendira';
  }

  private panelUrl() {
    const base = (this.config.get<string>('APP_URL') || '')
      .trim()
      .replace(/\/$/, '');
    return base ? `${base}/admin/settings/planos` : null;
  }

  /**
   * Para quem mandar: o e-mail fiscal da loja, com queda para o admin dela.
   * Loja sem e-mail fiscal cadastrado ficaria sem aviso nenhum, que é o pior
   * cenário — é justamente quem some antes de pagar.
   */
  private async destinatario(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { sellerEmail: true },
    });
    const fiscal = store?.sellerEmail?.trim();
    if (fiscal) return fiscal;

    const admin = await this.prisma.user.findFirst({
      where: { storeId, role: 'STORE_ADMIN' },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin?.email?.trim() || null;
  }

  async notificar(invoiceId: string, kind: BillingMailKind): Promise<void> {
    try {
      const invoice = await this.prisma.platformInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          store: {
            select: {
              id: true,
              name: true,
              planDueAt: true,
              accentColor: true,
            },
          },
        },
      });
      if (!invoice) return;

      const para = await this.destinatario(invoice.store.id);
      if (!para) {
        this.logger.warn(
          `Loja ${invoice.store.id} sem e-mail para avisar da mensalidade`,
        );
        return;
      }

      const graceDays = Number(this.config.get<string>('BILLING_GRACE_DAYS'));
      const carencia = Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : 7;
      const suspendeEm = invoice.dueAt
        ? new Date(invoice.dueAt.getTime() + carencia * 24 * 60 * 60 * 1000)
        : null;

      const mail = buildBillingEmail({
        kind,
        brandName: this.brandName(),
        storeName: invoice.store.name,
        planName: invoice.planName,
        amount: Number(invoice.amount),
        copiaECola: invoice.pixCopiaECola,
        expiresAt: invoice.pixExpiresAt,
        nextDueAt: invoice.store.planDueAt,
        suspendeEm,
        panelUrl: this.panelUrl(),
        accentColor: invoice.store.accentColor || undefined,
      });

      const r = await this.mail.send({
        to: para,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (r.sent) {
        this.logger.log(
          `Aviso de mensalidade "${kind}" enviado (store=${invoice.store.id})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao avisar da mensalidade (invoice=${invoiceId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
