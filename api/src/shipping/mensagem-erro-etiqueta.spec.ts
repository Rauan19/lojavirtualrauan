import { createMelhorEnvioLabel } from './providers/melhor-envio-label';

/**
 * A mensagem que chega ao lojista quando a compra da etiqueta falha. Sem
 * tradução ele recebia o JSON cru do Melhor Envio e abria chamado achando que
 * a integração quebrou — na maioria das vezes o que falta é saldo.
 */
const ctx = {
  token: 'tok',
  sandbox: true,
  contactEmail: 'loja@exemplo.com',
  serviceId: 1,
  from: {} as never,
  to: {} as never,
  products: [],
  volumes: [],
  insuranceValue: 100,
};

function respondeCom(status: number, corpo: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => corpo,
  });
}

describe('erro ao comprar etiqueta', () => {
  it('explica saldo insuficiente em vez de devolver o JSON cru', async () => {
    respondeCom(400, '{"message":"Saldo insuficiente para esta operação"}');
    await expect(createMelhorEnvioLabel(ctx as never)).rejects.toThrow(
      /Adicione saldo no painel deles/i,
    );
  });

  it.each([
    ['insufficient balance', '{"error":"insufficient funds"}'],
    ['balance em ingles', '{"error":"Not enough balance"}'],
  ])('reconhece %s', async (_label, corpo) => {
    respondeCom(422, corpo);
    await expect(createMelhorEnvioLabel(ctx as never)).rejects.toThrow(
      /Saldo insuficiente/i,
    );
  });

  it('manda reconectar quando o acesso é recusado', async () => {
    respondeCom(401, '{"message":"Unauthenticated"}');
    await expect(createMelhorEnvioLabel(ctx as never)).rejects.toThrow(
      /Reconecte a conta em Configurações/i,
    );
  });

  it('preserva o texto original para erro que não sabemos traduzir', async () => {
    respondeCom(500, '{"message":"boom interno"}');
    await expect(createMelhorEnvioLabel(ctx as never)).rejects.toThrow(
      /boom interno/,
    );
  });
});
