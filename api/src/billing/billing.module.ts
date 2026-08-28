import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingCronService } from './billing-cron.service';
import { BillingService } from './billing.service';
import { PlatformPlansService } from './platform-plans.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingCronService, PlatformPlansService],
  exports: [BillingService, PlatformPlansService],
})
export class BillingModule {}
