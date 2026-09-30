import { Logger } from '@nestjs/common';
import { Fila, type NomeTarefa } from './fila';

/**
 * Fila que executa na hora, no mesmo processo. Só para testes (e para rodar
 * sem o pg-boss com FILA_DRIVER=imediata): não repete em caso de erro — quem
 * garante o reprocessamento é a varredura de segurança.
 */
export class FilaImediata extends Fila {
  private readonly logger = new Logger('Fila');
  private readonly trabalhos = new Map<string, (d: object) => Promise<void>>();

  async enviar<T extends object>(nome: NomeTarefa, dados: T): Promise<void> {
    const executar = this.trabalhos.get(nome);
    if (!executar) return;
    try {
      await executar(dados);
    } catch (err) {
      this.logger.warn(
        `Tarefa ${nome} falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  trabalhar<T extends object>(
    nome: NomeTarefa,
    executar: (dados: T) => Promise<void>,
  ): Promise<void> {
    this.trabalhos.set(nome, executar);
    return Promise.resolve();
  }
}
