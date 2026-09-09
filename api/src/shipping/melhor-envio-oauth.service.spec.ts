import { BadRequestException } from '@nestjs/common';
import { MelhorEnvioOauthService } from './melhor-envio-oauth.service';

/**
 * O `state` é o que amarra a volta do Melhor Envio a uma loja específica.
 * Se ele puder ser forjado, qualquer um manda um `code` e grava token na
 * loja alheia — por isso os testes de adulteração e expiração.
 */
const ENV: Record<string, string> = {
  JWT_SECRET: 'segredo-de-teste',
  ME_SANDBOX_CLIENT_ID: '11836',
  ME_SANDBOX_CLIENT_SECRET: 'secret-sandbox',
  ME_SANDBOX_REDIRECT_URI: 'https://tunel.example/api/shipping/melhor-envio/callback',
};

function build(env: Record<string, string> = ENV, sandbox = true) {
  const prisma = {
    store: {
      findUnique: jest.fn().mockResolvedValue({ freteSandbox: sandbox }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const secrets = {
    encrypt: (v: string | null) => v,
    decrypt: (v: string | null) => v,
  };
  const config = { get: (k: string) => env[k] };
  const service = new MelhorEnvioOauthService(
    prisma as never,
    secrets as never,
    config as never,
  );
  return { service, prisma };
}

// signState/readState são privados de propósito; o teste alcança pelo nome.
function sign(service: MelhorEnvioOauthService, storeId: string) {
  return (
    service as unknown as {
      signState(id: string, sandbox: boolean): string;
    }
  ).signState(storeId, true);
}

function read(service: MelhorEnvioOauthService, state: string) {
  return (
    service as unknown as {
      readState(s: string): { storeId: string; sandbox: boolean };
    }
  ).readState(state);
}

describe('URL de autorização', () => {
  it('leva client_id, redirect, escopos e state', async () => {
    const { service } = build();
    const { url } = await service.authorizeUrl('loja-1');
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://sandbox.melhorenvio.com.br');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('11836');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      ENV.ME_SANDBOX_REDIRECT_URI,
    );
    expect(parsed.searchParams.get('scope')).toContain('shipping-checkout');
    expect(parsed.searchParams.get('state')).toBeTruthy();
  });

  it('usa a base de produção quando a loja não está em sandbox', async () => {
    const { service } = build(
      {
        ...ENV,
        ME_CLIENT_ID: '999',
        ME_CLIENT_SECRET: 's',
        ME_REDIRECT_URI: 'https://vendira.com.br/cb',
      },
      false,
    );
    const { url } = await service.authorizeUrl('loja-1');
    expect(new URL(url).origin).toBe('https://www.melhorenvio.com.br');
    expect(new URL(url).searchParams.get('client_id')).toBe('999');
  });

  it('avisa quando o aplicativo não foi configurado no .env', async () => {
    const { service } = build({ JWT_SECRET: 'x' });
    await expect(service.authorizeUrl('loja-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('state', () => {
  it('volta com a mesma loja que entrou', () => {
    const { service } = build();
    expect(read(service, sign(service, 'loja-42')).storeId).toBe('loja-42');
  });

  it('recusa assinatura de outro segredo', () => {
    const { service } = build();
    const { service: intruso } = build({ ...ENV, JWT_SECRET: 'outro' });

    expect(() => read(service, sign(intruso, 'loja-alheia'))).toThrow(
      BadRequestException,
    );
  });

  it('recusa payload trocado mantendo a assinatura', () => {
    const { service } = build();
    const [, sig] = sign(service, 'loja-1').split('.');
    const forjado = Buffer.from(
      JSON.stringify({ sid: 'loja-2', sb: true, exp: Date.now() + 60000 }),
    ).toString('base64url');

    expect(() => read(service, `${forjado}.${sig}`)).toThrow(
      BadRequestException,
    );
  });

  it.each([['sem ponto', 'abc'], ['vazio', ''], ['só assinatura', '.xyz']])(
    'recusa state malformado (%s)',
    (_label, state) => {
      const { service } = build();
      expect(() => read(service, state)).toThrow(BadRequestException);
    },
  );

  it('recusa state vencido', () => {
    const { service } = build();
    const state = sign(service, 'loja-1');

    jest.useFakeTimers().setSystemTime(Date.now() + 11 * 60 * 1000);
    try {
      expect(() => read(service, state)).toThrow(/expirou/i);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('desconectar', () => {
  it('apaga os dois tokens e os dados da conta', async () => {
    const { service, prisma } = build();
    await service.disconnect('loja-1');

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'loja-1' },
      data: {
        freteToken: null,
        freteRefreshToken: null,
        freteTokenExpiresAt: null,
        freteContaNome: null,
        freteContaEmail: null,
      },
    });
  });
});

describe('renovação do token', () => {
  it('não renova quem usa token colado na mão (sem refresh)', async () => {
    const { service, prisma } = build();
    prisma.store.findUnique.mockResolvedValue({
      freteToken: 'token-colado',
      freteRefreshToken: null,
      freteTokenExpiresAt: null,
      freteSandbox: true,
    });

    await expect(service.ensureFreshToken('loja-1')).resolves.toBe(
      'token-colado',
    );
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('devolve o token atual quando ainda falta muito para vencer', async () => {
    const { service, prisma } = build();
    prisma.store.findUnique.mockResolvedValue({
      freteToken: 'token-vigente',
      freteRefreshToken: 'refresh',
      freteTokenExpiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      freteSandbox: true,
    });

    await expect(service.ensureFreshToken('loja-1')).resolves.toBe(
      'token-vigente',
    );
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('não derruba a cotação quando a renovação falha', async () => {
    const { service, prisma } = build();
    prisma.store.findUnique.mockResolvedValue({
      freteToken: 'token-antigo',
      freteRefreshToken: 'refresh',
      freteTokenExpiresAt: new Date(Date.now() + 60 * 1000),
      freteSandbox: true,
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('rede caiu'));

    await expect(service.ensureFreshToken('loja-1')).resolves.toBe(
      'token-antigo',
    );
  });

  it('manda o corpo no formato que a documentação deles especifica', async () => {
    const { service, prisma } = build();
    prisma.store.findUnique.mockResolvedValue({
      freteToken: 'token-antigo',
      freteRefreshToken: 'refresh-antigo',
      freteTokenExpiresAt: new Date(Date.now() + 60 * 1000),
      freteSandbox: true,
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ access_token: 'novo', expires_in: 2592000 }),
    });
    global.fetch = fetchMock;

    await service.ensureFreshToken('loja-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.melhorenvio.com.br/oauth/token');
    expect(init.headers['Content-Type']).toBe('application/json');

    const corpo = JSON.parse(init.body);
    expect(corpo).toEqual({
      grant_type: 'refresh_token',
      // integer, não string: é como o campo está tipado na doc deles
      client_id: 11836,
      client_secret: 'secret-sandbox',
      redirect_uri: ENV.ME_SANDBOX_REDIRECT_URI,
      code: null,
      refresh_token: 'refresh-antigo',
    });
  });

  it('renova e grava o par novo quando está perto de vencer', async () => {
    const { service, prisma } = build();
    prisma.store.findUnique.mockResolvedValue({
      freteToken: 'token-antigo',
      freteRefreshToken: 'refresh-antigo',
      freteTokenExpiresAt: new Date(Date.now() + 60 * 1000),
      freteSandbox: true,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: 'token-novo',
          refresh_token: 'refresh-novo',
          expires_in: 2592000,
        }),
    });

    await expect(service.ensureFreshToken('loja-1')).resolves.toBe(
      'token-novo',
    );

    const data = prisma.store.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.freteToken).toBe('token-novo');
    expect(data.freteRefreshToken).toBe('refresh-novo');
    expect(data.freteTokenExpiresAt).toBeInstanceOf(Date);
  });
});
