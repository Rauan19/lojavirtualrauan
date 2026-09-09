/**
 * Varredura periódica que sabe se desligar.
 *
 * Quatro serviços repetiam o mesmo esqueleto: `void this.tarefa()` no boot, um
 * `setInterval` e um `onModuleDestroy` que só limpava o timer. Faltava esperar
 * a rodada em voo — ela seguia tocando depois de o app fechar e batia num
 * Prisma já desconectado ("Response from the Engine was empty"). Nos testes
 * isso deixava o Jest pendurado; num deploy com SIGTERM, corta a varredura no
 * meio.
 *
 * De quebra resolve a sobreposição: numa base grande a rodada pode passar da
 * hora, e sem trava duas varreduras rodavam juntas em cima das mesmas linhas.
 */
export class SweepRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    // `unknown` porque varias tarefas devolvem contagem; o retorno e ignorado.
    private readonly task: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onError: (err: unknown) => void,
  ) {}

  /** Roda uma vez agora e agenda as próximas. */
  start() {
    this.trigger();
    this.timer = setInterval(() => this.trigger(), this.intervalMs);
  }

  private trigger() {
    if (this.stopping || this.running) return;
    this.running = this.task()
      .then(() => undefined)
      .catch((err) => this.onError(err))
      .finally(() => {
        this.running = null;
      });
  }

  /** Para de agendar e espera a rodada em voo terminar. */
  async stop() {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.running;
  }

  /** Só para teste: se há rodada em voo neste instante. */
  get ocupado() {
    return this.running !== null;
  }
}
