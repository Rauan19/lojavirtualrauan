import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PublicController } from './public.controller';

@Module({
  imports: [BillingModule],
  controllers: [PublicController],
})
export class PublicModule {}
