import { ConfigService } from '@nestjs/config';

/**
 * URL que o Mercado Pago chama quando o cliente paga (Pix/cartão) ou
 * quando o pagamento muda (aprovado, rejeitado, reembolsado).
 *
 * Montagem: {PUBLIC_URL}/api/payments/webhooks/mercadopago[?secret=...][&store=...]
 *
 * O `store` faz o webhook resolver a loja em uma única chamada à API do MP.
 * Sem ele, a notificação precisa ser testada contra o token de cada loja
 * cadastrada — o que vira N requisições por evento conforme a base cresce.
 */
export function buildMercadoPagoWebhookUrl(
  config: ConfigService,
  storeId?: string,
): string | null {
  const base = (config.get<string>('PUBLIC_URL') || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return null;

  const path = `${base}/api/payments/webhooks/mercadopago`;
  const params = new URLSearchParams();

  const secret = config.get<string>('MP_WEBHOOK_SECRET')?.trim();
  if (secret) params.set('secret', secret);
  if (storeId?.trim()) params.set('store', storeId.trim());

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
