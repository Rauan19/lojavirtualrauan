import {
  Controller,
  Get,
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
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { MercadoPagoOauthService } from './mercadopago-oauth.service';

@Controller()
export class MercadoPagoOauthController {
  private readonly logger = new Logger(MercadoPagoOauthController.name);

  constructor(
    private readonly oauth: MercadoPagoOauthService,
    private readonly config: ConfigService,
  ) {}

  /** Devolve a URL de autorização; o painel só redireciona para ela. */
  @Get('admin/payments/mercadopago/authorize')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  authorize(@CurrentStore() store: TenantStore) {
    return this.oauth.authorizeUrl(store.id);
  }

  @Post('admin/payments/mercadopago/disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  disconnect(@CurrentStore() store: TenantStore) {
    return this.oauth.disconnect(store.id);
  }

  /**
   * Volta da autorização. Pública de propósito: quem chega é o navegador do
   * lojista, redirecionado pelo Mercado Pago, sem o token do painel. O
   * `state` assinado diz de qual loja é, e prova que o pedido partiu de nós.
   */
  @Get('payments/mercadopago/oauth/callback')
  async callback(
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
      `${front}/admin/settings?secao=payments&mercadopago=${status}`;

    if (error || !code || !state) return res.redirect(back('erro'));
    try {
      await this.oauth.handleCallback(code, state);
      return res.redirect(back('conectado'));
    } catch (err) {
      this.logger.warn(
        `Callback do Mercado Pago falhou: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return res.redirect(back('erro'));
    }
  }
}
