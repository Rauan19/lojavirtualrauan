import { Module, forwardRef } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrintingModule } from '../printing/printing.module';
import { ShippingModule } from '../shipping/shipping.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    CouponsModule,
    PrintingModule,
    InvoicesModule,
    ShippingModule,
    StorefrontModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
