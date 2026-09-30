import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { emTrava, TravasService } from '../fila/travas.service';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../common/secrets/secrets.service';
import { SweepRunner } from '../common/utils/sweep-runner';
import { PrismaService } from '../prisma/prisma.service';

/*
 * .com.br e não o .com do exemplo da documentação: o .com abre primeiro
 * "Seleccione el país" (em espanhol) antes do login; o .com.br vai direto
 * para o login brasileiro. Mesmos parâmetros, testado no navegador.
 */
const AUTH_URL = 'https://auth.mercadopago.com.br/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

/**
 * O token do OAuth vale 180 dias. Renova com 30 de folga: se o refresh falhar
 * num dia, sobram semanas de tentativas antes de a loja parar de vender.
 */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRES_IN = 180 * 24 * 60 * 60;
const STATE_TTL_MS = 10 * 60 * 1000;
/** Uma volta por dia basta para um token de 180 dias. */
const SWEEP_MS = 24 * 60 * 60 * 1000;

type TokenResponse = {
  access_token?: string;
  public_key?: string;
  refresh_token?: string;
  user_id?: number | string;
  expires_in?: number;
  live_mode?: boolean;
  error?: string;
  message?: string;
};

/**
 * "Conectar com Mercado Pago": o lojista autoriza o aplicativo da Vendira na
 * conta dele. É isso que permite cobrar a comissão da plataforma em cada venda
 * (split, via application_fee) — com token colado na mão o Mercado Pago não
 * sabe que a Vendira existe.
 *
 * O token conectado vai para os mesmos campos (mpAccessToken/mpPublicKey) que o
 * checkout, o webhook e o reembolso já usam; por isso nada disso muda.
 */
@Injectable()
export class MercadoPagoOauthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MercadoPagoOauthService.name);
  private readonly sweeper = new SweepRunner(
    () =>
      emTrava(this.travas, 'mp-oauth-renovacao', () => this.renovarVencendo()),
    SWEEP_MS,
    (err) =>
      this.logger.warn(
        `Renovação dos tokens do Mercado Pago falhou: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
    @Optional() private readonly travas?: TravasService,
  ) {}

  onModuleInit() {
    // Sem app configurado não há token de OAuth para renovar
    if (this.config.get<string>('MP_CLIENT_ID')?.trim()) this.sweeper.start();
  }

  async onModuleDestroy() {
    await this.sweeper.stop();
  }

  private credentials() {
    const clientId = this.config.get<string>('MP_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MP_CLIENT_SECRET')?.trim();
    const publicUrl = this.config.get<string>('PUBLIC_URL')?.trim();
    const redirectUri =
      this.config.get<string>('MP_OAUTH_REDIRECT_URI')?.trim() ||
      (publicUrl
        ? `${publicUrl.replace(/\/$/, '')}/api/payments/mercadopago/oauth/callback`
        : '');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Aplicativo do Mercado Pago não configurado: preencha MP_CLIENT_ID, MP_CLIENT_SECRET e MP_OAUTH_REDIRECT_URI (ou PUBLIC_URL) no .env da API.',
      );
    }
    return {
      clientId,
      clientSecret,
      redirectUri,
      // Conta de vendedor de teste: o MP devolve credenciais TEST-
      testToken: this.config.get<string>('MP_OAUTH_TEST') === 'true',
    };
  }

  private stateKey() {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new BadRequestException('JWT_SECRET não configurado');
    return secret;
  }

  /**
   * `state` assinado: carrega de qual loja é a autorização e expira em 10
   * minutos. O campo `p` separa do state do Melhor Envio, que usa a mesma
   * chave — um não serve no callback do outro.
   */
  signState(storeId: string) {
    const payload = Buffer.from(
      JSON.stringify({
        p: 'mp',
        sid: storeId,
        exp: Date.now() + STATE_TTL_MS,
        n: randomBytes(8).toString('hex'),
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.stateKey())
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  }

  readState(state: string): string {
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
      p?: string;
      sid?: string;
      exp?: number;
    };
    if (data.p !== 'mp' || !data.sid) {
      throw new BadRequestException('state inválido');
    }
    if (!data.exp || data.exp < Date.now()) {
      throw new BadRequestException('Autorização expirou. Tente de novo.');
    }
    return data.sid;
  }

  /** URL para onde o botão "Conectar com Mercado Pago" manda o lojista. */
  async authorizeUrl(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const { clientId, redirectUri } = this.credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      state: this.signState(storeId),
      redirect_uri: redirectUri,
    });
    return { url: `${AUTH_URL}?${params.toString()}` };
  }

  private async requestToken(
    body: Record<string, string | boolean>,
  ): Promise<TokenResponse> {
    const res = await fetch(TOKEN_URL, {
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
        `Mercado Pago devolveu resposta inválida: ${text.slice(0, 200)}`,
      );
    }
    if (!res.ok || !data.access_token) {
      throw new Error(
        `Mercado Pago recusou o token (${res.status}): ${
          data.message || data.error || text.slice(0, 200)
        }`,
      );
    }
    return data;
  }

  private expiresAt(token: TokenResponse) {
    return new Date(
      Date.now() + (token.expires_in ?? DEFAULT_EXPIRES_IN) * 1000,
    );
  }

  /** Troca o `code` da volta do Mercado Pago pelos tokens e guarda cifrado. */
  async handleCallback(code: string, state: string) {
    const storeId = this.readState(state);
    const { clientId, clientSecret, redirectUri, testToken } =
      this.credentials();

    const token = await this.requestToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      // A documentação manda como texto ("true"/"false")
      ...(testToken ? { test_token: 'true' } : {}),
    });

    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        mpAccessToken: this.secrets.encrypt(token.access_token as string),
        mpPublicKey: token.public_key || null,
        mpRefreshToken: token.refresh_token
          ? this.secrets.encrypt(token.refresh_token)
          : null,
        mpTokenExpiresAt: this.expiresAt(token),
        mpUserId: token.user_id != null ? String(token.user_id) : null,
        mpConnectedAt: new Date(),
        // O MP nem sempre manda live_mode; o prefixo do token diz o ambiente
        mpLiveMode:
          token.live_mode ?? !String(token.access_token).startsWith('TEST-'),
      },
    });

    this.logger.log(
      `Mercado Pago conectado · loja ${storeId} · conta ${token.user_id ?? '?'}${
        String(token.access_token).startsWith('TEST-') ? ' (teste)' : ''
      }`,
    );
    return { storeId };
  }

  /**
   * Garante token válido antes de cobrar ou reembolsar, renovando se estiver
   * perto de vencer. Loja com token colado na mão (sem refresh) fica como
   * está — continua funcionando enquanto migra para a conexão.
   */
  async ensureFreshToken(storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { mpRefreshToken: true, mpTokenExpiresAt: true },
    });
    const refresh = this.secrets.decryptSafe(store?.mpRefreshToken);
    if (!store || !refresh) return;

    const expiresAt = store.mpTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt - Date.now() > RENEW_BEFORE_MS) return;

    try {
      const { clientId, clientSecret } = this.credentials();
      const token = await this.requestToken({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refresh,
      });
      await this.prisma.store.update({
        where: { id: storeId },
        data: {
          mpAccessToken: this.secrets.encrypt(token.access_token as string),
          ...(token.public_key ? { mpPublicKey: token.public_key } : {}),
          ...(token.refresh_token
            ? { mpRefreshToken: this.secrets.encrypt(token.refresh_token) }
            : {}),
          mpTokenExpiresAt: this.expiresAt(token),
        },
      });
      this.logger.log(`Token do Mercado Pago renovado · loja ${storeId}`);
    } catch (err) {
      // Com 30 dias de folga o token atual ainda vale; tenta de novo amanhã
      this.logger.warn(
        `Falha ao renovar token do Mercado Pago · loja ${storeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Varredura diária: renova quem vence nos próximos 30 dias. */
  async renovarVencendo() {
    const limite = new Date(Date.now() + RENEW_BEFORE_MS);
    const lojas = await this.prisma.store.findMany({
      where: {
        mpRefreshToken: { not: null },
        mpTokenExpiresAt: { lt: limite },
      },
      select: { id: true },
    });
    for (const loja of lojas) await this.ensureFreshToken(loja.id);
    return lojas.length;
  }

  /** Esquece a conexão. Não revoga no Mercado Pago. */
  async disconnect(storeId: string) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        mpAccessToken: null,
        mpPublicKey: null,
        mpRefreshToken: null,
        mpTokenExpiresAt: null,
        mpUserId: null,
        mpConnectedAt: null,
        mpLiveMode: null,
      },
    });
    return { ok: true };
  }
}
