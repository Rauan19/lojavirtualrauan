import { ConfigService } from '@nestjs/config';

/**
 * Webhook da mensalidade SaaS (credenciais da plataforma).
 * {PUBLIC_URL}/api/billing/webhooks/mercadopago[?secret=...]
 */
export function buildPlatformBillingWebhookUrl(
  config: ConfigService,
): string | null {
  const base = (config.get<string>('PUBLIC_URL') || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return null;

  const path = `${base}/api/billing/webhooks/mercadopago`;
  // Mesmo secret do webhook de pedidos (MercadoPagoWebhookGuard).
  const secret = config.get<string>('MP_WEBHOOK_SECRET')?.trim();
  if (!secret) return path;
  return `${path}?secret=${encodeURIComponent(secret)}`;
}
