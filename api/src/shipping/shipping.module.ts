import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShippingController } from './shipping.controller';
import { LabelService } from './label.service';
import { MelhorEnvioOauthService } from './melhor-envio-oauth.service';
import { ShipmentEventsService } from './shipment-events.service';
import { ShippingService } from './shipping.service';
import { TrackingService } from './tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShippingController],
  providers: [
    ShippingService,
    TrackingService,
    LabelService,
    MelhorEnvioOauthService,
    ShipmentEventsService,
  ],
  exports: [
    ShippingService,
    TrackingService,
    LabelService,
    MelhorEnvioOauthService,
    ShipmentEventsService,
  ],
})
export class ShippingModule {}
