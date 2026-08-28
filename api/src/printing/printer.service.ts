import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { resolvePublicAddress } from '../common/utils/network-target';

export type ReceiptLine = {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
};

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  buildEscPos(lines: ReceiptLine[], paperWidthMm = 80): Buffer {
    const cols = paperWidthMm <= 58 ? 32 : 48;
    const chunks: number[] = [];
    const push = (...bytes: number[]) => chunks.push(...bytes);

    // Init
    push(0x1b, 0x40);
    // Code page / UTF-8-ish fallback: use CP850-ish by stripping accents in text

    for (const line of lines) {
      if (line.bold) push(0x1b, 0x45, 0x01);
      else push(0x1b, 0x45, 0x00);

      const align =
        line.align === 'center' ? 1 : line.align === 'right' ? 2 : 0;
      push(0x1b, 0x61, align);

      const text = this.sanitize(line.text).slice(0, cols);
      for (let i = 0; i < text.length; i++) {
        push(text.charCodeAt(i) & 0xff);
      }
      push(0x0a);
    }

    push(0x1b, 0x45, 0x00);
    push(0x1b, 0x61, 0x00);
    // Feed + cut
    push(0x0a, 0x0a, 0x0a);
    push(0x1d, 0x56, 0x00);

    return Buffer.from(chunks);
  }

  /** `true` só se PRINTER_ALLOW_PRIVATE_NETWORK=true (servidor na mesma LAN da impressora). */
  private allowPrivateNetwork(): boolean {
    return (
      (process.env.PRINTER_ALLOW_PRIVATE_NETWORK || '').trim().toLowerCase() ===
      'true'
    );
  }

  async sendNetwork(
    host: string,
    port: number,
    data: Buffer,
    timeoutMs = 8000,
  ): Promise<void> {
    // O host vem do painel do lojista: valida antes de abrir socket e conecta
    // no IP já resolvido, para não dar brecha a DNS rebinding.
    const address = await resolvePublicAddress(
      host,
      this.allowPrivateNetwork(),
    );

    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err);
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () =>
        fail(new Error('Timeout ao conectar na impressora')),
      );
      socket.once('error', (err) => fail(err));
      socket.connect(port, address, () => {
        socket.write(data, (err) => {
          if (err) return fail(err);
          socket.end(() => {
            if (settled) return;
            settled = true;
            resolve();
          });
        });
      });
    });
  }

  sanitize(input: string) {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '?');
  }
}
