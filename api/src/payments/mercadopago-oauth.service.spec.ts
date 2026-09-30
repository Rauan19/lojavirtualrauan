import { BadRequestException } from '@nestjs/common';
import { SecretsService } from '../common/secrets/secrets.service';
import { MercadoPagoOauthService } from './mercadopago-oauth.service';

const DIA = 24 * 60 * 60 * 1000;

function montar(
  env: Record<string, string | undefined> = {},
  loja: Record<string, unknown> | null = { id: 'loja-1' },
) {
  const config = {
    get: (k: string) =>
      ({
        MP_CLIENT_ID: 'app-123',
        MP_CLIENT_SECRET: 'segredo-do-app',
        MP_OAUTH_REDIRECT_URI:
          'https://api.exemplo.com/api/payments/mercadopago/oauth/callback',
        JWT_SECRET: 'jwt-de-teste',
        ENCRYPTION_KEY: 'a'.repeat(64),
        ...env,
      })[k],
  };
  const secrets = new SecretsService(config as never);
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    store: {
      findUnique: jest.fn().mockResolvedValue(loja),
      findMany: jest.fn().mockResolvedValue([]),
      update,
    },
  };
  const svc = new MercadoPagoOauthService(
    prisma as never,
    secrets,
    config as never,
  );
  return { svc, update, secrets, prisma };
}

function respostaToken(corpo: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(corpo)),
  };
}

describe('MercadoPagoOauthService', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  it('monta a URL de autorização do app da Vendira com state da loja', async () => {
    const { svc } = montar();
    const { url } = await svc.authorizeUrl('loja-1');
    const u = new URL(url);

    expect(u.origin).toBe('https://auth.mercadopago.com.br');
    expect(u.searchParams.get('client_id')).toBe('app-123');
    expect(u.searchParams.get('platform_id')).toBe('mp');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('redirect_uri')).toContain('/oauth/callback');
    expect(svc.readState(u.searchParams.get('state')!)).toBe('loja-1');
  });

  it('sem app configurado, explica o que falta no .env', async () => {
    const { svc } = montar({ MP_CLIENT_ID: undefined });
    await expect(svc.authorizeUrl('loja-1')).rejects.toThrow(/MP_CLIENT_ID/);
  });

  it('recusa state adulterado, expirado ou do Melhor Envio', () => {
    const { svc } = montar();
    const bom = svc.signState('loja-1');
    const [payload, sig] = bom.split('.');

    const outraLoja = Buffer.from(
      JSON.stringify({ p: 'mp', sid: 'loja-2', exp: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(() => svc.readState(`${outraLoja}.${sig}`)).toThrow(
      BadRequestException,
    );
    expect(() => svc.readState(`${payload}.xx`)).toThrow(/adulterado/);

    jest.useFakeTimers().setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(() => svc.readState(bom)).toThrow(/expirou/);
    jest.useRealTimers();
  });

  it('no retorno, troca o code e guarda os tokens cifrados', async () => {
    const { svc, update, secrets } = montar();
    fetchMock.mockResolvedValue(
      respostaToken({
        access_token: 'APP_USR-token-da-loja',
        public_key: 'APP_USR-chave-publica',
        refresh_token: 'TG-refresh',
        user_id: 998877,
        expires_in: 15552000,
        live_mode: true,
      }),
    );

    await svc.handleCallback('codigo-1', svc.signState('loja-1'));

    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(corpo).toMatchObject({
      client_id: 'app-123',
      client_secret: 'segredo-do-app',
      grant_type: 'authorization_code',
      code: 'codigo-1',
    });
    expect(corpo.test_token).toBeUndefined();

    const { where, data } = update.mock.calls[0][0];
    expect(where).toEqual({ id: 'loja-1' });
    expect(data.mpAccessToken).not.toContain('APP_USR');
    expect(secrets.decrypt(data.mpAccessToken)).toBe('APP_USR-token-da-loja');
    expect(secrets.decrypt(data.mpRefreshToken)).toBe('TG-refresh');
    expect(data.mpPublicKey).toBe('APP_USR-chave-publica');
    expect(data.mpUserId).toBe('998877');
    expect(data.mpLiveMode).toBe(true);
    expect(data.mpTokenExpiresAt.getTime()).toBeGreaterThan(
      Date.now() + 170 * DIA,
    );
  });

  it('com MP_OAUTH_TEST=true pede credenciais de teste', async () => {
    const { svc } = montar({ MP_OAUTH_TEST: 'true' });
    fetchMock.mockResolvedValue(
      respostaToken({ access_token: 'TEST-x', live_mode: false }),
    );
    await svc.handleCallback('c', svc.signState('loja-1'));
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(corpo.test_token).toBe('true');
  });

  it('sem live_mode na resposta, descobre pelo prefixo TEST- do token', async () => {
    const { svc, update } = montar();
    fetchMock.mockResolvedValue(respostaToken({ access_token: 'TEST-abc' }));
    await svc.handleCallback('c', svc.signState('loja-1'));
    expect(update.mock.calls[0][0].data.mpLiveMode).toBe(false);
  });

  it('não grava nada se o Mercado Pago recusar o code', async () => {
    const { svc, update } = montar();
    fetchMock.mockResolvedValue(
      respostaToken({ message: 'invalid_grant' }, 400),
    );
    await expect(
      svc.handleCallback('velho', svc.signState('loja-1')),
    ).rejects.toThrow(/invalid_grant/);
    expect(update).not.toHaveBeenCalled();
  });

  describe('renovação', () => {
    it('token colado na mão (sem refresh) fica como está', async () => {
      const { svc, update } = montar({}, { mpRefreshToken: null });
      await svc.ensureFreshToken('loja-1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('longe do vencimento, não renova', async () => {
      const base = montar();
      const refresh = base.secrets.encrypt('TG-refresh');
      const { svc } = montar(
        {},
        {
          mpRefreshToken: refresh,
          mpTokenExpiresAt: new Date(Date.now() + 90 * DIA),
        },
      );
      await svc.ensureFreshToken('loja-1');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('perto de vencer, renova e guarda o token novo', async () => {
      const base = montar();
      const refresh = base.secrets.encrypt('TG-refresh');
      const { svc, update, secrets } = montar(
        {},
        {
          mpRefreshToken: refresh,
          mpTokenExpiresAt: new Date(Date.now() + 5 * DIA),
        },
      );
      fetchMock.mockResolvedValue(
        respostaToken({
          access_token: 'APP_USR-novo',
          refresh_token: 'TG-novo',
        }),
      );

      await svc.ensureFreshToken('loja-1');

      const corpo = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(corpo).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'TG-refresh',
      });
      const { data } = update.mock.calls[0][0];
      expect(secrets.decrypt(data.mpAccessToken)).toBe('APP_USR-novo');
      expect(secrets.decrypt(data.mpRefreshToken)).toBe('TG-novo');
    });

    it('falha na renovação não derruba a venda', async () => {
      const base = montar();
      const { svc, update } = montar(
        {},
        {
          mpRefreshToken: base.secrets.encrypt('TG-refresh'),
          mpTokenExpiresAt: new Date(Date.now() + DIA),
        },
      );
      fetchMock.mockRejectedValue(new Error('rede caiu'));
      await expect(svc.ensureFreshToken('loja-1')).resolves.toBeUndefined();
      expect(update).not.toHaveBeenCalled();
    });
  });

  it('desconectar apaga token, chave e refresh', async () => {
    const { svc, update } = montar();
    await svc.disconnect('loja-1');
    expect(update.mock.calls[0][0].data).toMatchObject({
      mpAccessToken: null,
      mpPublicKey: null,
      mpRefreshToken: null,
      mpUserId: null,
    });
  });
});
