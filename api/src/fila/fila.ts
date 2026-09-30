/**
 * Fila de tarefas da Vendira.
 *
 * O resto do código só conhece esta classe — nunca o pg-boss direto. Se um
 * dia a fila for para Redis/BullMQ, troca-se a implementação aqui e nada
 * mais muda.
 *
 * Toda tarefa precisa ser idempotente: a fila entrega "pelo menos uma vez"
 * (repete em caso de erro ou de queda do processo no meio).
 */
export abstract class Fila {
  /**
   * Põe uma tarefa na fila. `chaveUnica` evita duplicar a mesma tarefa
   * enquanto ela ainda não rodou (ex.: o MP manda 3 webhooks seguidos do
   * mesmo pagamento → uma conciliação só).
   */
  abstract enviar<T extends object>(
    nome: NomeTarefa,
    dados: T,
    opcoes?: { chaveUnica?: string; atrasoSegundos?: number },
  ): Promise<void>;

  /** Registra quem executa as tarefas de um nome. */
  abstract trabalhar<T extends object>(
    nome: NomeTarefa,
    executar: (dados: T) => Promise<void>,
  ): Promise<void>;
}

/** Nomes das filas. Um lugar só, para não ter nome digitado errado. */
export const TAREFAS = {
  conciliarComissao: 'comissao.conciliar',
} as const;

export type NomeTarefa = (typeof TAREFAS)[keyof typeof TAREFAS];

/**
 * Tira da URL do Prisma os parâmetros que só o Prisma entende
 * (`schema`, `connection_limit`...), para o driver `pg` não estranhar.
 */
export function urlParaPg(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const p of [
    'schema',
    'connection_limit',
    'pool_timeout',
    'pgbouncer',
    'connect_timeout',
    'socket_timeout',
    'statement_cache_size',
  ]) {
    url.searchParams.delete(p);
  }
  return url.toString();
}
