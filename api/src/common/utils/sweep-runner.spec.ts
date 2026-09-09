import { SweepRunner } from './sweep-runner';

/**
 * O que este runner existe para garantir: ao desligar, a rodada em voo é
 * esperada. Sem isso ela seguia tocando depois de o app fechar e batia num
 * Prisma já desconectado.
 */
const proximoTick = () => new Promise((r) => setImmediate(r));

describe('SweepRunner', () => {
  it('roda uma vez assim que inicia', async () => {
    const tarefa = jest.fn().mockResolvedValue(undefined);
    const runner = new SweepRunner(tarefa, 60_000, () => {});

    runner.start();
    await runner.stop();

    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it('stop espera a rodada em voo terminar', async () => {
    let terminar!: () => void;
    const emVoo = new Promise<void>((r) => {
      terminar = r;
    });
    let acabou = false;
    const tarefa = jest.fn(async () => {
      await emVoo;
      acabou = true;
    });

    const runner = new SweepRunner(tarefa, 60_000, () => {});
    runner.start();
    expect(runner.ocupado).toBe(true);

    const parada = runner.stop();
    expect(acabou).toBe(false); // ainda não — é esse o ponto

    terminar();
    await parada;
    expect(acabou).toBe(true);
  });

  it('não deixa duas rodadas se sobreporem', async () => {
    let terminar!: () => void;
    const emVoo = new Promise<void>((r) => {
      terminar = r;
    });
    const tarefa = jest.fn(() => emVoo);

    const runner = new SweepRunner(tarefa, 1, () => {});
    runner.start();

    jest.useFakeTimers();
    jest.advanceTimersByTime(50);
    jest.useRealTimers();

    expect(tarefa).toHaveBeenCalledTimes(1);
    terminar();
    await runner.stop();
  });

  it('erro na tarefa vai para o onError e não derruba o processo', async () => {
    const onError = jest.fn();
    const runner = new SweepRunner(
      () => Promise.reject(new Error('banco caiu')),
      60_000,
      onError,
    );

    runner.start();
    await runner.stop();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('não começa rodada nova depois do stop', async () => {
    const tarefa = jest.fn().mockResolvedValue(undefined);
    const runner = new SweepRunner(tarefa, 1, () => {});

    runner.start();
    await runner.stop();
    await proximoTick();

    expect(tarefa).toHaveBeenCalledTimes(1);
  });
});
