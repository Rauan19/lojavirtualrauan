import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AllowPastDue } from '../common/decorators/allow-past-due.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MercadoPagoWebhookGuard } from '../common/guards/mercadopago-webhook.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { BillingService } from './billing.service';
import { UpdatePlatformMercadoPagoDto } from './dto/platform-mp.dto';
import {
  CreatePlatformPlanDto,
  UpdatePlatformGeneralDto,
  UpdatePlatformPlanDto,
} from './dto/platform-plan.dto';
import { PlatformPlansService } from './platform-plans.service';

/**
 * Todas as rotas ficam liberadas com a loja inadimplente — é justamente
 * por aqui que o lojista volta a pagar.
 */
@Controller('billing')
@AllowPastDue()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly platformPlansService: PlatformPlansService,
  ) {}

  /** Gestão de planos — só Super Admin. Preço/trial mudam sem precisar de deploy. */
  @Get('platform/plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  listAllPlans() {
    return this.platformPlansService.listAll();
  }

  @Post('platform/plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createPlan(@Body() dto: CreatePlatformPlanDto) {
    return this.platformPlansService.create(dto);
  }

  @Patch('platform/plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlatformPlanDto) {
    return this.platformPlansService.update(id, dto);
  }

  @Delete('platform/plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  removePlan(@Param('id') id: string) {
    return this.platformPlansService.remove(id);
  }

  @Get('platform/general')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async getGeneral() {
    return { trialDays: await this.billingService.getTrialDays() };
  }

  @Patch('platform/general')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async updateGeneral(@Body() dto: UpdatePlatformGeneralDto) {
    if (dto.trialDays === undefined) {
      return { trialDays: await this.billingService.getTrialDays() };
    }
    return this.billingService.updateTrialDays(dto.trialDays);
  }

  /** Super Admin: credenciais MP da plataforma (recebe mensalidade de todas as lojas). */
  @Get('platform/mercadopago')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  platformMpGet() {
    return this.billingService.getPlatformMpSettings();
  }

  @Patch('platform/mercadopago')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  platformMpPatch(@Body() dto: UpdatePlatformMercadoPagoDto) {
    return this.billingService.updatePlatformMp(dto);
  }

  /** Diagnóstico da URL pública — sem ela nenhum webhook chega. */
  @Get('platform/webhook-check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  webhookCheck() {
    return this.billingService.testarWebhookPublico();
  }

  @Post('platform/mercadopago/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  platformMpTest() {
    return this.billingService.testPlatformMp();
  }

  /**
   * Callback do Mercado Pago após autorizar assinatura.
   * Sincroniza status no MP → ativa loja → redireciona pro front.
   */
  @Get('return')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async returnFromMp(
    @Res() res: Response,
    @Query('invoice') invoice?: string,
    @Query('status') status?: string,
  ) {
    await this.billingService.syncAfterMpReturn(invoice).catch(() => undefined);
    const url = this.billingService.buildReturnRedirect(invoice, status);
    return res.redirect(302, url);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  async plans() {
    return { plans: await this.billingService.listPlans() };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  me(@CurrentStore() store: TenantStore) {
    return this.billingService.mySubscription(store.id);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribe(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() body: { planId?: string; cardTokenId?: string; token?: string },
  ) {
    const planId = body?.planId?.trim() || 'mensal';
    const cardTokenId = (body?.cardTokenId || body?.token || '').trim();
    return this.billingService.createAuthorizedSubscription(
      store.id,
      planId,
      cardTokenId,
      user.email,
    );
  }

  /** Assinar pagando por Pix: define o método e já devolve a primeira cobrança. */
  @Post('subscribe/pix')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribePix(
    @CurrentStore() store: TenantStore,
    @Body() body: { planId?: string },
  ) {
    return this.billingService.subscribeWithPix(
      store.id,
      body?.planId?.trim() || 'mensal',
    );
  }

  /** QR em aberto, para o painel mostrar sem gerar cobrança nova. */
  @Get('pix/atual')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  pixAtual(@CurrentStore() store: TenantStore) {
    return this.billingService.cobrancaPixAberta(store.id);
  }

  /**
   * Gera a cobrança do ciclo sob demanda. Serve para loja suspensa, que a
   * varredura automática não cobra, e para quem deixou o QR expirar.
   */
  @Post('pix/gerar')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  gerarPix(@CurrentStore() store: TenantStore) {
    return this.billingService.emitirCobrancaPix(store.id);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Body() body: { planId?: string },
  ) {
    const planId = body?.planId?.trim() || 'mensal';
    return this.billingService.createCheckout(store.id, planId, user.email);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  cancel(@CurrentStore() store: TenantStore) {
    return this.billingService.cancelSubscription(store.id);
  }

  @Post('invoices/:id/sync')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
  sync(@CurrentStore() store: TenantStore, @Param('id') id: string) {
    return this.billingService.syncInvoice(id, store.id);
  }

  @Post('webhooks/mercadopago')
  @UseGuards(MercadoPagoWebhookGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webhookPost(
    @Body() body: { type?: string; action?: string; data?: { id?: string } },
  ) {
    return this.billingService.handleWebhook(body);
  }

  @Get('webhooks/mercadopago')
  @UseGuards(MercadoPagoWebhookGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webhookGet(
    @Query('id') id?: string,
    @Query('topic') topic?: string,
    @Query('type') type?: string,
    @Query('data.id') dataId?: string,
  ) {
    return this.billingService.handleWebhook({
      id,
      topic,
      type,
      data: { id: dataId || id },
    });
  }
}
