import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../common/secrets/secrets.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Permissões pedidas na autorização — exatamente o que o código exercita hoje
 * (cotar, montar carrinho, pagar, emitir, imprimir, rastrear, cancelar) mais
 * `users-read`, que é como descobrimos de quem é a conta conectada para
 * mostrar no painel. Escopo a mais só assusta o lojista na tela do Melhor
 * Envio.
 */
const SCOPES = [
  'shipping-calculate',
  'cart-read',
  'cart-write',
  'shipping-checkout',
  'shipping-generate',
  'shipping-print',
  'shipping-tracking',
  'shipping-cancel',
  'users-read',
].join(' ');

/**
 * O access token vale 30 dias. Renovar só no vencimento quebraria a loja se o
 * refresh falhasse naquele instante; com 3 dias de folga sobram várias
 * tentativas antes de alguém sentir.
 */
const RENEW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_EXPIRES_IN = 30 * 24 * 60 * 60;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
};

function baseUrl(sandbox: boolean) {
  return sandbox
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://www.melhorenvio.com.br';
}

@Injectable()
export class MelhorEnvioOauthService {
  private readonly logger = new Logger(MelhorEnvioOauthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Um aplicativo por ambiente: sandbox e produção têm bases, contas e
   * credenciais distintas. Qual par vale sai do `freteSandbox` da loja.
   */
  private credentials(sandbox: boolean) {
    const prefix = sandbox ? 'ME_SANDBOX_' : 'ME_';
    const clientId = this.config.get<string>(`${prefix}CLIENT_ID`)?.trim();
    const clientSecret = this.config
      .get<string>(`${prefix}CLIENT_SECRET`)
      ?.trim();
    const redirectUri = this.config.get<string>(`${prefix}REDIRECT_URI`)?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        `Aplicativo do Melhor Envio não configurado: preencha ${prefix}CLIENT_ID, ${prefix}CLIENT_SECRET e ${prefix}REDIRECT_URI no .env da API.`,
      );
    }
    /*
     * A documentacao deles tipa client_id como integer. Passport costuma
     * aceitar string, mas mandar no tipo documentado sai mais barato do que
     * descobrir a diferenca num 401 sem mensagem.
     */
    const numericId = Number(clientId);
    return {
      clientId: Number.isInteger(numericId) ? numericId : clientId,
      clientSecret,
      redirectUri,
    };
  }

  private stateKey() {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new BadRequestException('JWT_SECRET não configurado');
    return secret;
  }

  /**
   * `state` assinado em vez de guardado em tabela: ele só precisa sobreviver
   * aos segundos entre o clique e a volta do Melhor Envio, e carrega de qual
   * loja é o pedido — sem isso o callback não sabe onde gravar o token.
   */
  private signState(storeId: string, sandbox: boolean) {
    const payload = Buffer.from(
      JSON.stringify({
        sid: storeId,
        sb: sandbox,
        exp: Date.now() + STATE_TTL_MS,
        n: randomBytes(8).toString('hex'),
      }),
    ).toString('base64url');

    const sig = createHmac('sha256', this.stateKey())
      .update(payload)
      .digest('base64url');

    return `${payload}.${sig}`;
  }

  private readState(state: string): { storeId: string; sandbox: boolean } {
    const [payload, sig] = (state || '').split('.');
    if (!payload || !sig) throw new BadRequestException('state inválido');

    const expected = createHmac('sha256', this.stateKey())
      .update(payload)
      .digest('base64url');

    const received = Buffer.from(sig);
    const wanted = Buffer.from(expected);
    if (
      received.length !== wanted.length ||
      !timingSafeEqual(received, wanted)
    ) {
      throw new BadRequestException('state adulterado');
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sid?: string;
      sb?: boolean;
      exp?: number;
    };

    if (!data.sid || !data.exp || data.exp < Date.now()) {
      throw new BadRequestException('Autorização expirou. Tente de novo.');
    }
    return { storeId: data.sid, sandbox: Boolean(data.sb) };
  }

  /** URL para onde o botão "Conectar" manda o lojista. */
  async authorizeUrl(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { freteSandbox: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const sandbox = store.freteSandbox === true;
    const { clientId, redirectUri } = this.credentials(sandbox);

    // Na URL de autorizacao tudo e texto; o integer so vale no corpo do token.
    const params = new URLSearchParams({
      client_id: String(clientId),
      redirect_uri: redirectUri,
      response_type: 'code',
      state: this.signState(storeId, sandbox),
      scope: SCOPES,
    });

    return { url: `${baseUrl(sandbox)}/oauth/authorize?${params.toString()}` };
  }

  private async requestToken(
    sandbox: boolean,
    body: Record<string, string | number | null>,
  ): Promise<TokenResponse> {
    const res = await fetch(`${baseUrl(sandbox)}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: TokenResponse;
    try {
      data = JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(
        `Melhor Envio devolveu resposta inválida: ${text.slice(0, 200)}`,
      );
    }

    if (!res.ok || !data.access_token) {
      throw new Error(
        `Melhor Envio recusou o token (${res.status}): ${
          data.error || data.message || text.slice(0, 200)
        }`,
      );
    }
    return data;
  }

  /**
   * Nome e e-mail da conta autorizada — serve só para o painel mostrar
   * "conectado como" em vez de um token cru. Falhar aqui não invalida a
   * conexão, então o erro é engolido.
   */
  private async fetchAccount(sandbox: boolean, accessToken: string) {
    try {
      const res = await fetch(`${baseUrl(sandbox)}/api/v2/me`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) return { nome: null, email: null };

      const data = (await res.json()) as {
        firstname?: string;
        lastname?: string;
        email?: string;
      };
      const nome = [data.firstname, data.lastname].filter(Boolean).join(' ');
      return { nome: nome || null, email: data.email || null };
    } catch {
      return { nome: null, email: null };
    }
  }

  private expiresAtFrom(token: TokenResponse) {
    return new Date(Date.now() + (token.expires_in ?? DEFAULT_EXPIRES_IN) * 1000);
  }

  /** Troca o `code` da volta pelo par de tokens e guarda cifrado. */
  async handleCallback(code: string, state: string) {
    const { storeId, sandbox } = this.readState(state);
    const { clientId, clientSecret, redirectUri } = this.credentials(sandbox);

    const token = await this.requestToken(sandbox, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      refresh_token: null,
    });

    const conta = await this.fetchAccount(sandbox, token.access_token as string);

    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        freteToken: this.secrets.encrypt(token.access_token as string),
        freteRefreshToken: token.refresh_token
          ? this.secrets.encrypt(token.refresh_token)
          : null,
        freteTokenExpiresAt: this.expiresAtFrom(token),
        freteContaNome: conta.nome,
        freteContaEmail: conta.email,
      },
    });

    this.logger.log(`Melhor Envio conectado · loja ${storeId}`);
    return { storeId };
  }

  /**
   * Devolve um access token válido, renovando quando está perto de vencer.
   *
   * Loja que ainda usa token colado na mão não tem refresh: nesse caso o token
   * dela volta como está, e continua sendo responsabilidade do lojista trocar
   * quando expirar. É o que mantém as lojas antigas funcionando enquanto
   * migram para o OAuth.
   */
  async ensureFreshToken(storeId: string): Promise<string | null> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        freteToken: true,
        freteRefreshToken: true,
        freteTokenExpiresAt: true,
        freteSandbox: true,
      },
    });
    if (!store) return null;

    const current = this.secrets.decrypt(store.freteToken);
    const refresh = this.secrets.decrypt(store.freteRefreshToken);
    if (!refresh) return current;

    const expiresAt = store.freteTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt - Date.now() > RENEW_BEFORE_MS) return current;

    try {
      const sandbox = store.freteSandbox === true;
      const { clientId, clientSecret, redirectUri } = this.credentials(sandbox);

      const token = await this.requestToken(sandbox, {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        // O exemplo oficial manda os seis campos nos dois fluxos.
        redirect_uri: redirectUri,
        code: null,
        refresh_token: refresh,
      });

      await this.prisma.store.update({
        where: { id: storeId },
        data: {
          freteToken: this.secrets.encrypt(token.access_token as string),
          ...(token.refresh_token
            ? { freteRefreshToken: this.secrets.encrypt(token.refresh_token) }
            : {}),
          freteTokenExpiresAt: this.expiresAtFrom(token),
        },
      });

      this.logger.log(`Token do Melhor Envio renovado · loja ${storeId}`);
      return token.access_token as string;
    } catch (err) {
      /*
       * Falhar aqui não pode derrubar a cotação: o token atual provavelmente
       * ainda está válido, já que renovamos com 3 dias de folga. Devolvemos o
       * que temos e registramos — se de fato expirou, o próprio Melhor Envio
       * responde 401 e o erro sobe com contexto.
       */
      this.logger.warn(
        `Falha ao renovar token do Melhor Envio · loja ${storeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return current;
    }
  }

  /** Desconecta a conta. Não revoga no Melhor Envio — só esquece os tokens. */
  async disconnect(storeId: string) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        freteToken: null,
        freteRefreshToken: null,
        freteTokenExpiresAt: null,
        freteContaNome: null,
        freteContaEmail: null,
      },
    });
    return { ok: true };
  }
}
