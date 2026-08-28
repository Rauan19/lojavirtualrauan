import type { QuoteContext, ShipOption } from './types';

/**
 * SuperFrete — cotação popular em lojas menores.
 * POST https://api.superfrete.com/api/v0/calculator
 */
export async function quoteSuperFrete(
  ctx: QuoteContext,
): Promise<ShipOption[]> {
  const products = ctx.products.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weight: Math.max(0.1, p.weight ?? 0.5),
    height: Math.max(1, p.height ?? 10),
    width: Math.max(1, p.width ?? 16),
    length: Math.max(1, p.length ?? 20),
  }));

  const res = await fetch('https://api.superfrete.com/api/v0/calculator', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.token}`,
      'User-Agent': `LojaVirtual (${ctx.contactEmail || 'contato@loja.com.br'})`,
    },
    body: JSON.stringify({
      from: { postal_code: ctx.fromZip },
      to: { postal_code: ctx.toZip },
      services: '1,2,17',
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: ctx.subtotal,
        use_insurance_value: true,
      },
      products,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `SuperFrete retornou ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`,
    );
  }

  const data = (await res.json()) as Array<{
    id?: number | string;
    name?: string;
    price?: string | number;
    discount?: string | number;
    delivery_time?: number;
    company?: { name?: string };
    error?: string;
  }>;

  if (!Array.isArray(data)) return [];

  return data
    .filter((row) => !row.error && row.price != null)
    .map((row) => {
      const price = Number(row.price);
      const days = Number(row.delivery_time ?? 7);
      const company = row.company?.name || '';
      const service = row.name || 'Frete';
      return {
        id: `sf-${row.id ?? service}`,
        name: company ? `${company} — ${service}` : service,
        price: Number(price.toFixed(2)),
        days: Math.max(1, days),
        company,
        raw: row,
      };
    })
    .filter((o) => o.price >= 0)
    .sort((a, b) => a.price - b.price);
}
