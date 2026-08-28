import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) return;
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  isConfigured() {
    return Boolean(this.transporter);
  }

  async send(
    input: SendMailInput,
  ): Promise<{ sent: boolean; preview?: string }> {
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      'noreply@localhost';

    if (!this.transporter) {
      this.logger.warn(
        `SMTP não configurado — e-mail não enviado para ${input.to}: ${input.subject}`,
      );
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.log(`[dev mail] to=${input.to}\n${input.text}`);
      }
      return { sent: false, preview: input.text };
    }

    await this.transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html || undefined,
    });
    return { sent: true };
  }
}
