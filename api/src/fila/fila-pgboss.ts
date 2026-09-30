import { Logger } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { Fila, TAREFAS, type NomeTarefa } from './fila';

/**
 * Fila no próprio Postgres (pg-boss, schema "pgboss").
 *
 * - Tarefa gravada no banco: não se perde num restart do PM2.
 * - Várias instâncias da API podem trabalhar juntas; o pg-boss usa
 *   SKIP LOCKED, então cada tarefa roda em um processo só.
 * - Erro → repete com espera crescente (até ~1h entre tentativas); depois
 *   de esgotar vai para a fila "<nome>.falhou" para olhar com calma.
 */
export class FilaPgBoss extends Fila {
  private readonly logger = new Logger('Fila');
  private boss: PgBoss | null = null;
  private iniciando: Promise<PgBoss> | null = null;

  constructor(private readonly connectionString: string) {
    super();
  }

  private iniciar(): Promise<PgBoss> {
    if (this.boss) return Promise.resolve(this.boss);
    this.iniciando ??= (async () => {
      const boss = new PgBoss({
        connectionString: this.connectionString,
        schema: 'pgboss',
        max: 4,
        application_name: 'vendira-fila',
      });
      boss.on('error', (err) =>
        this.logger.error(`pg-boss: ${err.message}`, err.stack),
      );
      await boss.start();
      for (const nome of Object.values(TAREFAS)) {
        const falhou = `${nome}.falhou`;
        await boss.createQueue(falhou, { retentionSeconds: 30 * 24 * 3600 });
        await boss.createQueue(nome, {
          retryLimit: 8,
          retryDelay: 30,
          retryBackoff: true,
          retryDelayMax: 3600,
          expireInSeconds: 5 * 60,
          deadLetter: falhou,
        });
      }
      this.boss = boss;
      return boss;
    })().catch((err) => {
      this.iniciando = null;
      throw err;
    });
    return this.iniciando;
  }

  async enviar<T extends object>(
    nome: NomeTarefa,
    dados: T,
    opcoes: { chaveUnica?: string; atrasoSegundos?: number } = {},
  ): Promise<void> {
    const boss = await this.iniciar();
    await boss.send(nome, dados, {
      singletonKey: opcoes.chaveUnica,
      startAfter: opcoes.atrasoSegundos,
    });
  }

  async trabalhar<T extends object>(
    nome: NomeTarefa,
    executar: (dados: T) => Promise<void>,
  ): Promise<void> {
    const boss = await this.iniciar();
    await boss.work<T>(nome, { pollingIntervalSeconds: 5 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await executar(job.data);
        } catch (err) {
          this.logger.warn(
            `Tarefa ${nome} (${job.id}) falhou, vai repetir: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          throw err;
        }
      }
    });
  }

  /** Espera as tarefas em andamento (até 20s) e fecha a conexão. */
  async parar() {
    const boss = this.boss ?? (this.iniciando ? await this.iniciando : null);
    if (!boss) return;
    await boss.stop({ graceful: true, wait: true, timeout: 20_000 });
    this.boss = null;
    this.iniciando = null;
  }
}
