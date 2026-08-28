import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { OrderAccessModule } from './common/order-access/order-access.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CouponsModule } from './coupons/coupons.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PromotionsModule } from './promotions/promotions.module';
import { PublicModule } from './public/public.module';
import { ShippingModule } from './shipping/shipping.module';
import { StorefrontModule } from './storefront/storefront.module';
import { StoresModule } from './stores/stores.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit padrão: 120 req / minuto por IP
    // Rotas sensíveis sobrescrevem com @Throttle (login, pagamento)
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
      serveRoot: `/${process.env.UPLOAD_DIR || 'uploads'}`,
    }),
    SecretsModule,
    OrderAccessModule,
    PrismaModule,
    MailModule,
    PublicModule,
    AuthModule,
    StoresModule,
    ProductsModule,
    OrdersModule,
    InvoicesModule,
    UploadsModule,
    DashboardModule,
    ShippingModule,
    PaymentsModule,
    BillingModule,
    CouponsModule,
    PromotionsModule,
    StorefrontModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
