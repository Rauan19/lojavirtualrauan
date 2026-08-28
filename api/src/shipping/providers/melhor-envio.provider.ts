import type { QuoteContext, ShipOption } from './types';

/**
 * Melhor Envio — inclui Correios, Jadlog, Latam, etc.
 * Docs: POST /api/v2/me/shipment/calculate
 */
export async function quoteMelhorEnvio(
  ctx: QuoteContext,
): Promise<ShipOption[]> {
  const base = ctx.sandbox
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://www.melhorenvio.com.br';

  if (!ctx.contactEmail?.trim()) {
    throw new Error(
      'E-mail de contato é obrigatório para cotar no Melhor Envio',
    );
  }

  const email = ctx.contactEmail.trim();
  const products = ctx.products.map((p, i) => ({
    id: p.id || String(i + 1),
    width: Math.max(1, p.width ?? 16),
    height: Math.max(1, p.height ?? 10),
    length: Math.max(1, p.length ?? 20),
    weight: Math.max(0.1, p.weight ?? 0.5),
    insurance_value: Number(p.price.toFixed(2)),
    quantity: Math.max(1, p.quantity),
  }));

  const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.token}`,
      'User-Agent': `LojaVirtualMensalidade (${email})`,
    },
    body: JSON.stringify({
      from: { postal_code: ctx.fromZip },
      to: { postal_code: ctx.toZip },
      products,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Melhor Envio retornou ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`,
    );
  }

  const data = (await res.json()) as Array<{
    id?: number | string;
    name?: string;
    price?: string | number;
    custom_price?: string | number;
    delivery_time?: number;
    custom_delivery_time?: number;
    company?: { name?: string };
    error?: string;
  }>;

  if (!Array.isArray(data)) return [];

  return data
    .filter((row) => !row.error && (row.custom_price ?? row.price) != null)
    .map((row) => {
      const price = Number(row.custom_price ?? row.price ?? 0);
      const days = Number(row.custom_delivery_time ?? row.delivery_time ?? 7);
      const company = row.company?.name || '';
      const service = row.name || 'Frete';
      return {
        id: `me-${row.id ?? service}`,
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
