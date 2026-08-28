import { Module, forwardRef } from '@nestjs/common';
import { MercadoPagoWebhookGuard } from '../common/guards/mercadopago-webhook.guard';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, MercadoPagoWebhookGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
