import { Module, forwardRef } from '@nestjs/common';
import { MercadoPagoWebhookGuard } from '../common/guards/mercadopago-webhook.guard';
import { OrdersModule } from '../orders/orders.module';
import { PlatformFeeModule } from '../platform-fee/platform-fee.module';
import { MercadoPagoOauthController } from './mercadopago-oauth.controller';
import { MercadoPagoOauthService } from './mercadopago-oauth.service';
import { ConciliacaoComissaoService } from './conciliacao-comissao.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [forwardRef(() => OrdersModule), PlatformFeeModule],
  controllers: [PaymentsController, MercadoPagoOauthController],
  providers: [
    PaymentsService,
    MercadoPagoOauthService,
    MercadoPagoWebhookGuard,
    ConciliacaoComissaoService,
  ],
  exports: [PaymentsService, MercadoPagoOauthService],
})
export class PaymentsModule {}
