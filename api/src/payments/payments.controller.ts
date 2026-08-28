import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { MercadoPagoWebhookGuard } from '../common/guards/mercadopago-webhook.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CustomerJwtGuard } from '../storefront/customer-jwt.guard';
import { GuestOrderScopeGuard } from '../storefront/guest-order-scope.guard';
import { InstallmentsBatchDto } from './dto/installments-batch.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Parcelas reais do MP (+ sem juros da oferta do produto). */
  @Get('storefront/installments')
  @UseGuards(TenantGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  installments(
    @CurrentStore() store: TenantStore,
    @Query('amount') amount?: string,
    @Query('freeUntil') freeUntil?: string,
    @Query('payment_method_id') paymentMethodId?: string,
  ) {
    return this.paymentsService.getInstallments(
      store.id,
      Number(amount),
      freeUntil ? Number(freeUntil) : 0,
      paymentMethodId || 'visa',
    );
  }

  /** Mesma coisa, mas pra vários produtos de uma vez — usado na vitrine. */
  @Post('storefront/installments/batch')
  @UseGuards(TenantGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  installmentsBatch(
    @CurrentStore() store: TenantStore,
    @Body() dto: InstallmentsBatchDto,
  ) {
    return this.paymentsService.getInstallmentsBatch(
      store.id,
      dto.items,
      dto.paymentMethodId || 'visa',
    );
  }

  @Post('checkout/orders/:orderId/pay')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createPreference(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.createPreference(store.id, orderId, user.id);
  }

  @Post('checkout/orders/:orderId/pay-brick')
  @UseGuards(TenantGuard, CustomerJwtGuard, GuestOrderScopeGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  processBrick(
    @CurrentStore() store: TenantStore,
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.paymentsService.processBrickPayment(
      store.id,
      orderId,
      body,
      user.id,
    );
  }

  /** Webhook MP: compra aprovada, Pix pago, reembolso etc. */
  @Post('payments/webhooks/mercadopago')
  @UseGuards(MercadoPagoWebhookGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webhookPost(
    @Body() body: { type?: string; action?: string; data?: { id?: string } },
    @Query('store') storeId?: string,
  ) {
    return this.paymentsService.handleWebhook(body, storeId);
  }

  /** IPN legado (GET ?id=&topic=payment) */
  @Get('payments/webhooks/mercadopago')
  @UseGuards(MercadoPagoWebhookGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webhookGet(
    @Query('id') id?: string,
    @Query('data.id') dataId?: string,
    @Query('topic') topic?: string,
    @Query('type') type?: string,
    @Query('store') storeId?: string,
  ) {
    return this.paymentsService.handleWebhook(
      {
        id: id || dataId,
        topic,
        type: type || topic,
        data: { id: dataId || id },
      },
      storeId,
    );
  }
}
