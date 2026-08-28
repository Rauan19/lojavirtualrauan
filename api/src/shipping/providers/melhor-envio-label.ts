/**
 * Compra e emissão de etiqueta no Melhor Envio.
 *
 * São quatro passos, nessa ordem — pular um faz o seguinte falhar:
 *   1. cart      → coloca o envio no carrinho e devolve o id do pedido ME
 *   2. checkout  → PAGA com o saldo da conta do lojista
 *   3. generate  → emite a etiqueta (só aí nasce o código de rastreio)
 *   4. print     → devolve o PDF para impressão
 *
 * Docs: https://docs.melhorenvio.com.br
 */

export type LabelParty = {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** CPF (11) ou CNPJ (14), só dígitos. */
  document?: string | null;
  companyDocument?: string | null;
  stateRegister?: string | null;
  address: string;
  complement?: string | null;
  number: string;
  district: string;
  city: string;
  stateAbbr: string;
  postalCode: string;
};

export type LabelProduct = {
  name: string;
  quantity: number;
  unitaryValue: number;
};

export type LabelVolume = {
  height: number;
  width: number;
  length: number;
  weight: number;
};

export type LabelContext = {
  token: string;
  sandbox: boolean;
  contactEmail: string;
  /** Id numérico do serviço (o "1" de "me-1"). */
  serviceId: number;
  from: LabelParty;
  to: LabelParty;
  products: LabelProduct[];
  volumes: LabelVolume[];
  insuranceValue: number;
  /** Referência do pedido na loja, aparece no painel do Melhor Envio. */
  reference?: string;
};

export type LabelResult = {
  shipmentId: string;
  trackingCode: string | null;
  labelUrl: string | null;
};

function baseUrl(sandbox: boolean) {
  return sandbox
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://www.melhorenvio.com.br';
}

function party(p: LabelParty) {
  const digits = (p.document || '').replace(/\D/g, '');
  return {
    name: p.name,
    phone: (p.phone || '').replace(/\D/g, '') || undefined,
    email: p.email || undefined,
    ...(digits.length === 11 ? { document: digits } : {}),
    ...(digits.length === 14 ? { company_document: digits } : {}),
    ...(p.stateRegister ? { state_register: p.stateRegister } : {}),
    address: p.address,
    complement: p.complement || undefined,
    number: p.number || 's/n',
    district: p.district,
    city: p.city,
    country_id: 'BR',
    postal_code: (p.postalCode || '').replace(/\D/g, ''),
    state_abbr: (p.stateAbbr || '').toUpperCase().slice(0, 2),
  };
}

async function call<T>(
  ctx: LabelContext,
  path: string,
  body: unknown,
  step: string,
): Promise<T> {
  const res = await fetch(`${baseUrl(ctx.sandbox)}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.token}`,
      'User-Agent': `LojaVirtualMensalidade (${ctx.contactEmail})`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Melhor Envio (${step}) respondeu ${res.status}${
        text ? `: ${text.slice(0, 250)}` : ''
      }`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Melhor Envio (${step}) devolveu resposta inválida`);
  }
}

export async function createMelhorEnvioLabel(
  ctx: LabelContext,
): Promise<LabelResult> {
  // 1) Carrinho
  const cart = await call<{ id?: string; protocol?: string }>(
    ctx,
    '/api/v2/me/cart',
    {
      service: ctx.serviceId,
      from: party(ctx.from),
      to: party(ctx.to),
      products: ctx.products.map((p) => ({
        name: p.name.slice(0, 120),
        quantity: Math.max(1, Math.floor(p.quantity)),
        unitary_value: Number(p.unitaryValue.toFixed(2)),
      })),
      volumes: ctx.volumes.map((v) => ({
        height: Math.max(1, v.height),
        width: Math.max(1, v.width),
        length: Math.max(1, v.length),
        weight: Math.max(0.1, v.weight),
      })),
      options: {
        insurance_value: Number(ctx.insuranceValue.toFixed(2)),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true,
        ...(ctx.reference ? { reference: ctx.reference } : {}),
      },
    },
    'carrinho',
  );

  const shipmentId = cart.id?.trim();
  if (!shipmentId) {
    throw new Error('Melhor Envio não devolveu o id do envio');
  }

  // 2) Pagamento com saldo da conta do lojista
  await call(
    ctx,
    '/api/v2/me/shipment/checkout',
    { orders: [shipmentId] },
    'pagamento',
  );

  // 3) Emissão — só depois disso existe rastreio
  await call(
    ctx,
    '/api/v2/me/shipment/generate',
    { orders: [shipmentId] },
    'geração',
  );

  // 4) PDF
  const print = await call<{ url?: string }>(
    ctx,
    '/api/v2/me/shipment/print',
    { mode: 'public', orders: [shipmentId] },
    'impressão',
  );

  // O rastreio aparece no pedido depois da emissão
  const tracking = await fetchTracking(ctx, shipmentId);

  return {
    shipmentId,
    trackingCode: tracking,
    labelUrl: print.url?.trim() || null,
  };
}

async function fetchTracking(
  ctx: LabelContext,
  shipmentId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${baseUrl(ctx.sandbox)}/api/v2/me/orders/${shipmentId}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${ctx.token}`,
          'User-Agent': `LojaVirtualMensalidade (${ctx.contactEmail})`,
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tracking?: string | null };
    return data.tracking?.trim() || null;
  } catch {
    // Rastreio também chega pelo webhook — não é motivo para falhar a emissão
    return null;
  }
}

/** Extrai o id numérico do serviço a partir do id da opção ("me-1" → 1). */
export function parseMelhorEnvioServiceId(
  optionId: string | null | undefined,
): number | null {
  if (!optionId) return null;
  const match = /^me-(\d+)$/.exec(optionId.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}
