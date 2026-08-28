import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { MelhorEnvioWebhookGuard } from '../common/guards/melhor-envio-webhook.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { QuoteShippingDto } from './dto/quote.dto';
import { ShippingService } from './shipping.service';
import { TrackingService } from './tracking.service';

@Controller()
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly trackingService: TrackingService,
  ) {}

  @Post('shipping/quote')
  @UseGuards(TenantGuard)
  quote(@CurrentStore() store: TenantStore, @Body() dto: QuoteShippingDto) {
    return this.shippingService.quote(store.id, dto);
  }

  /**
   * Webhook Melhor Envio.
   * Cadastre: {PUBLIC_URL}/api/shipping/webhooks/melhor-envio?secret={ME_WEBHOOK_SECRET}
   * (ou header x-me-signature / x-webhook-secret com o mesmo valor)
   */
  @Post('shipping/webhooks/melhor-envio')
  @UseGuards(MelhorEnvioWebhookGuard)
  melhorEnvioWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-me-signature') _signature?: string,
  ) {
    return this.trackingService.handleMelhorEnvioWebhook(body);
  }
}
