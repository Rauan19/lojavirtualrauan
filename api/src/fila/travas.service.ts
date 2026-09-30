import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { urlParaPg } from './fila';

/** Primeiro número da trava: separa as da Vendira das de outros (ex.: Prisma migrate). */
const ESPACO_VENDIRA = 7710;

/**
 * Trava entre processos com advisory lock do Postgres.
 *
 * Com a API rodando em 2+ processos (PM2 cluster, dois servidores), cada
 * varredura rodaria em todos ao mesmo tempo — duas cobranças da mesma
 * mensalidade, dois e-mails. Aqui só um processo pega a trava; os outros
 * pulam a rodada.
 *
 * Usa uma conexão própria e fixa: advisory lock de sessão pertence à
 * conexão, e o pool do Prisma não garante travar e destravar na mesma. Se a
 * conexão cair, o Postgres solta as travas sozinho — nada fica preso.
 */
@Injectable()
export class TravasService implements OnModuleDestroy {
  private readonly logger = new Logger(TravasService.name);
  private cliente: Client | null = null;
  private conectando: Promise<Client> | null = null;
  /** Uma consulta por vez na conexão (o driver pg não quer concorrência). */
  private emFila: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  private conexao(): Promise<Client> {
    if (this.cliente) return Promise.resolve(this.cliente);
    this.conectando ??= (async () => {
      const c = new Client({
        connectionString: urlParaPg(
          this.config.get<string>('DATABASE_URL') ?? '',
        ),
        application_name: 'vendira-travas',
      });
      c.on('error', (err) => {
        this.logger.warn(`Conexão das travas caiu: ${err.message}`);
        this.cliente = null;
        this.conectando = null;
      });
      await c.connect();
      this.cliente = c;
      return c;
    })().catch((err) => {
      this.conectando = null;
      throw err;
    });
    return this.conectando;
  }

  /**
   * Roda `tarefa` só se nenhum outro processo estiver com a trava `chave`.
   * Devolve `undefined` quando pulou.
   */
  async seLivre<T>(
    chave: string,
    tarefa: () => Promise<T>,
  ): Promise<T | undefined> {
    const ok = await this.consultar(
      'SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok',
      [ESPACO_VENDIRA, chave],
    );
    if (!ok) {
      this.logger.debug(
        `Varredura "${chave}" já está rodando em outro processo`,
      );
      return undefined;
    }
    try {
      return await tarefa();
    } finally {
      await this.consultar(
        'SELECT pg_advisory_unlock($1, hashtext($2)) AS ok',
        [ESPACO_VENDIRA, chave],
      ).catch(() => undefined);
    }
  }

  private consultar(sql: string, params: unknown[]): Promise<boolean> {
    const vez = this.emFila.then(async () => {
      const c = await this.conexao();
      const { rows } = await c.query<{ ok: boolean }>(sql, params);
      return rows[0]?.ok === true;
    });
    this.emFila = vez.catch(() => undefined);
    return vez;
  }

  async onModuleDestroy() {
    const c =
      this.cliente ??
      (this.conectando ? await this.conectando.catch(() => null) : null);
    this.cliente = null;
    this.conectando = null;
    await c?.end().catch(() => undefined);
  }
}

/**
 * Atalho para as varreduras: com o serviço de travas, roda só num processo;
 * sem ele (testes de unidade que montam o serviço na mão), roda direto.
 */
export function emTrava<T>(
  travas: TravasService | undefined,
  chave: string,
  tarefa: () => Promise<T>,
): Promise<T | undefined> {
  return travas ? travas.seLivre(chave, tarefa) : tarefa();
}
