import { StoresService } from './stores.service';

/**
 * Sandbox e produção são contas distintas no Melhor Envio: token de um é
 * recusado no outro. Trocar o ambiente sem soltar a conexão deixava o painel
 * dizendo "conectado" enquanto toda cotação respondia 401.
 */
function build(freteSandboxAtual: boolean) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    store: {
      findUnique: jest.fn().mockResolvedValue({ freteSandbox: freteSandboxAtual }),
      update,
    },
  };
  const secrets = {
    encrypt: (v: string | null) => (v ? `cifrado:${v}` : null),
    decryptStore: (v: unknown) => v,
  };
  // A ordem importa: prisma, config, secrets, billing, platformPlans.
  const service = new StoresService(
    prisma as never,
    { get: () => undefined } as never,
    secrets as never,
    {} as never,
    {} as never,
  );
  return { service, update };
}

const dadosDoUpdate = (update: jest.Mock) =>
  update.mock.calls[0][0].data as Record<string, unknown>;

describe('trocar o ambiente do Melhor Envio', () => {
  it('desconecta a conta ao sair do sandbox', async () => {
    const { service, update } = build(true);
    await service.updateShipping('loja-1', { freteSandbox: false } as never);

    expect(dadosDoUpdate(update)).toMatchObject({
      freteToken: null,
      freteRefreshToken: null,
      freteTokenExpiresAt: null,
      freteContaNome: null,
      freteContaEmail: null,
    });
  });

  it('desconecta também ao entrar no sandbox', async () => {
    const { service, update } = build(false);
    await service.updateShipping('loja-1', { freteSandbox: true } as never);

    expect(dadosDoUpdate(update)).toMatchObject({ freteRefreshToken: null });
  });

  it('salvar sem mexer no ambiente não derruba a conexão', async () => {
    const { service, update } = build(true);
    await service.updateShipping('loja-1', {
      freteSandbox: true,
      freteEmailContato: 'novo@loja.com',
    } as never);

    const data = dadosDoUpdate(update);
    expect(data).not.toHaveProperty('freteRefreshToken');
    expect(data).not.toHaveProperty('freteContaNome');
  });

  it('quem troca o ambiente e cola o token do novo fica com o token novo', async () => {
    const { service, update } = build(true);
    await service.updateShipping('loja-1', {
      freteSandbox: false,
      freteToken: 'token-de-producao',
    } as never);

    const data = dadosDoUpdate(update);
    expect(data.freteToken).toBe('cifrado:token-de-producao');
    // mas o vínculo OAuth do ambiente antigo cai de qualquer forma
    expect(data.freteRefreshToken).toBeNull();
  });
});
