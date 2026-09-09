import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MelhorEnvioWebhookGuard } from '../common/guards/melhor-envio-webhook.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { QuoteShippingDto } from './dto/quote.dto';
import { MelhorEnvioOauthService } from './melhor-envio-oauth.service';
import { ShippingService } from './shipping.service';
import { TrackingService } from './tracking.service';

@Controller()
export class ShippingController {
  private readonly logger = new Logger(ShippingController.name);

  constructor(
    private readonly shippingService: ShippingService,
    private readonly trackingService: TrackingService,
    private readonly meOauth: MelhorEnvioOauthService,
    private readonly config: ConfigService,
  ) {}

  @Post('shipping/quote')
  @UseGuards(TenantGuard)
  quote(@CurrentStore() store: TenantStore, @Body() dto: QuoteShippingDto) {
    return this.shippingService.quote(store.id, dto);
  }

  /**
   * Webhook Melhor Envio.
   * Cadastre: {PUBLIC_URL}/api/shipping/webhooks/melhor-envio?secret={ME_WEBHOOK_SECRET}
   * (ou header x-me-signature / x-webhook-secret com o mesmo valor)
   */
  @Post('shipping/webhooks/melhor-envio')
  @UseGuards(MelhorEnvioWebhookGuard)
  melhorEnvioWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-me-signature') _signature?: string,
  ) {
    return this.trackingService.handleMelhorEnvioWebhook(body);
  }

  /** Devolve a URL da tela de autorização; o painel só redireciona para ela. */
  @Get('admin/shipping/melhor-envio/authorize')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  melhorEnvioAuthorize(@CurrentStore() store: TenantStore) {
    return this.meOauth.authorizeUrl(store.id);
  }

  /**
   * Volta da autorização. Rota pública de propósito: quem chega aqui é o
   * navegador do lojista, redirecionado pelo Melhor Envio, sem o cabeçalho de
   * autenticação do painel. Quem garante de qual loja é o pedido — e que ele
   * partiu de nós — é o `state` assinado.
   */
  @Get('shipping/melhor-envio/callback')
  async melhorEnvioCallback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const front = (this.config.get<string>('FRONTEND_URL') || '').replace(
      /\/$/,
      '',
    );
    const back = (status: string) =>
      `${front}/admin/settings?melhorenvio=${status}`;

    if (error || !code || !state) {
      return res.redirect(back('erro'));
    }

    try {
      await this.meOauth.handleCallback(code, state);
      return res.redirect(back('conectado'));
    } catch (err) {
      /*
       * O lojista está no meio de um redirecionamento: devolver JSON de erro
       * deixaria ele numa página branca. Volta para o painel com o aviso e o
       * motivo fica no log.
       */
      this.logger.warn(
        `Callback do Melhor Envio falhou: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return res.redirect(back('erro'));
    }
  }

  @Post('admin/shipping/melhor-envio/disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  melhorEnvioDisconnect(@CurrentStore() store: TenantStore) {
    return this.meOauth.disconnect(store.id);
  }
}
