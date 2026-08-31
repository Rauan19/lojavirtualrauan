import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { BillingMailService } from './billing-mail.service';
import { OrderMailService } from './order-mail.service';

@Global()
@Module({
  providers: [MailService, OrderMailService, BillingMailService],
  exports: [MailService, OrderMailService, BillingMailService],
})
export class MailModule {}
