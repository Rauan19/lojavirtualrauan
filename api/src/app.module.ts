import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { OrderAccessModule } from './common/order-access/order-access.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CouponsModule } from './coupons/coupons.module';
import { CustomersModule } from './customers/customers.module';
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

import { AccessLogService } from './common/access-log.service';
import { AccessLogInterceptor } from './common/interceptors/access-log.interceptor';

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
    CustomersModule,
    PromotionsModule,
    StorefrontModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    AccessLogService,
    /*
     * Marco Civil art. 15: guarda dos registros de acesso por 6 meses. Fica
     * global de propósito — obrigação legal não pode depender de alguém
     * lembrar de anotar o interceptor em cada controller novo.
     */
    {
      provide: APP_INTERCEPTOR,
      useClass: AccessLogInterceptor,
    },
  ],
})
export class AppModule {}
