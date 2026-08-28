import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProductsModule } from '../products/products.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [JwtModule.register({}), ProductsModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
