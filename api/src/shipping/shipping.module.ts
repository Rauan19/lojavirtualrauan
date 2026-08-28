import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShippingController } from './shipping.controller';
import { LabelService } from './label.service';
import { ShippingService } from './shipping.service';
import { TrackingService } from './tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShippingController],
  providers: [ShippingService, TrackingService, LabelService],
  exports: [ShippingService, TrackingService, LabelService],
})
export class ShippingModule {}
