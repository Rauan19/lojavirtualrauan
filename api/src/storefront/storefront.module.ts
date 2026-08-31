import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [JwtModule.register({}), ProductsModule, CustomersModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
