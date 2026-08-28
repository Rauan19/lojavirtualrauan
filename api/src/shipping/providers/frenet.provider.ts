import type { QuoteContext, ShipOption } from './types';

/**
 * Frenet — cotação multi-transportadora (inclui Correios).
 * POST https://api.frenet.com.br/shipping/quote
 */
export async function quoteFrenet(ctx: QuoteContext): Promise<ShipOption[]> {
  const items = ctx.products.map((p) => ({
    Weight: Math.max(0.1, p.weight ?? 0.5),
    Length: Math.max(1, p.length ?? 20),
    Height: Math.max(1, p.height ?? 10),
    Width: Math.max(1, p.width ?? 16),
    Quantity: Math.max(1, p.quantity),
    Price: Number(p.price.toFixed(2)),
  }));

  const res = await fetch('https://api.frenet.com.br/shipping/quote', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: ctx.token,
    },
    body: JSON.stringify({
      SellerCEP: ctx.fromZip,
      RecipientCEP: ctx.toZip,
      ShipmentInvoiceValue: ctx.subtotal,
      ShippingItemArray: items,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Frenet retornou ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`,
    );
  }

  const data = (await res.json()) as {
    ShippingSevicesArray?: Array<{
      ServiceCode?: string;
      ServiceDescription?: string;
      Carrier?: string;
      ShippingPrice?: string | number;
      DeliveryTime?: string | number;
      Error?: boolean | string;
      Msg?: string;
    }>;
  };

  const list = data.ShippingSevicesArray || [];
  return list
    .filter((row) => !row.Error && row.ShippingPrice != null)
    .map((row) => {
      const price = Number(row.ShippingPrice);
      const days = Number(row.DeliveryTime || 7);
      const carrier = row.Carrier || '';
      const service = row.ServiceDescription || 'Frete';
      return {
        id: `frenet-${row.ServiceCode || service}`,
        name: carrier ? `${carrier} — ${service}` : service,
        price: Number(price.toFixed(2)),
        days: Math.max(1, days),
        company: carrier,
        raw: row,
      };
    })
    .filter((o) => !Number.isNaN(o.price) && o.price >= 0)
    .sort((a, b) => a.price - b.price);
}
