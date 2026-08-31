import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Registro de acesso à aplicação — Marco Civil da Internet, art. 15.
 *
 * Provedor de aplicação constituído como pessoa jurídica com fins econômicos
 * deve guardar os registros de acesso por 6 meses, sob sigilo, e só entregá-los
 * mediante ordem judicial (art. 22).
 *
 * Duas decisões que valem explicar:
 *
 * 1. Uma linha por titular/IP por hora, não por requisição. A lei pede "data e
 *    hora de uso de uma aplicação a partir de um determinado IP" — registrar
 *    cada clique multiplicaria a tabela por centenas sem acrescentar nada ao
 *    que ela precisa provar.
 *
 * 2. Guardar por 6 meses é obrigação, mas guardar além disso é passivo: vira
 *    dado pessoal acumulado sem base legal. A limpeza roda sozinha.
 */

/** Prazo do art. 15: 6 meses. */
const RETENCAO_DIAS = 180;

/** Janela de deduplicação: um registro por titular/IP por hora. */
const JANELA_MS = 60 * 60 * 1000;

const LIMPEZA_MS = 12 * 60 * 60 * 1000;

type Registro = {
  storeId?: string | null;
  customerId?: string | null;
  userId?: string | null;
  ip: string;
  userAgent?: string | null;
  path: string;
};

@Injectable()
export class AccessLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessLogService.name);
  private timer: NodeJS.Timeout | null = null;

  /** Chaves já gravadas na janela atual, para não bater no banco à toa. */
  private readonly recentes = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.limparAntigos();
    this.timer = setInterval(() => {
      void this.limparAntigos();
      this.podarCache();
    }, LIMPEZA_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Nunca lança: log de acesso não pode derrubar a requisição do cliente. */
  async registrar(dados: Registro): Promise<void> {
    try {
      const titular = dados.customerId || dados.userId || 'anonimo';
      const chave = `${titular}|${dados.ip}|${dados.storeId ?? ''}`;
      const agora = Date.now();
      const ultimo = this.recentes.get(chave);
      if (ultimo && agora - ultimo < JANELA_MS) return;
      this.recentes.set(chave, agora);

      await this.prisma.accessLog.create({
        data: {
          storeId: dados.storeId ?? null,
          customerId: dados.customerId ?? null,
          userId: dados.userId ?? null,
          ip: dados.ip.slice(0, 45),
          userAgent: dados.userAgent?.slice(0, 300) ?? null,
          path: dados.path.slice(0, 200),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar acesso: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async limparAntigos() {
    try {
      const corte = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);
      const { count } = await this.prisma.accessLog.deleteMany({
        where: { createdAt: { lt: corte } },
      });
      if (count > 0) {
        this.logger.log(
          `Removidos ${count} registro(s) de acesso com mais de ${RETENCAO_DIAS} dias`,
        );
      }
      return count;
    } catch (err) {
      this.logger.warn(
        `Falha ao limpar registros de acesso: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  private podarCache() {
    const limite = Date.now() - JANELA_MS;
    for (const [chave, quando] of this.recentes) {
      if (quando < limite) this.recentes.delete(chave);
    }
  }
}
