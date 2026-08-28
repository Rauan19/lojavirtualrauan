import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrderAccessService } from './order-access.service';

/** Global: usado no checkout (storefront) e no e-mail de confirmação. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [OrderAccessService],
  exports: [OrderAccessService],
})
export class OrderAccessModule {}
