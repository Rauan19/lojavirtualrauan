/** Monta link de rastreio (URL custom, Correios ou Jadlog). */
export function resolveTrackingUrl(
  code?: string | null,
  customUrl?: string | null,
  shippingMethod?: string | null,
): string | null {
  if (customUrl?.trim()) return customUrl.trim();
  if (!code?.trim()) return null;
  const c = code.trim();
  const method = (shippingMethod || '').toLowerCase();
  if (method.includes('jadlog')) {
    return `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${encodeURIComponent(c)}`;
  }
  return `https://www.linkcorreios.com.br/?id=${encodeURIComponent(c)}`;
}
export type TrackStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  at?: string | null;
};

/** Timeline estilo Shopee/ML a partir do status do pedido. */
export function buildTrackingSteps(order: {
  status: string;
  paymentStatus: string;
  createdAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  updatedAt?: string;
}): TrackStep[] {
  const paid =
    order.paymentStatus === 'APPROVED' ||
    ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const processing =
    paid && ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const shipped = ['SHIPPED', 'DELIVERED'].includes(order.status);
  const delivered = order.status === 'DELIVERED';

  const steps: TrackStep[] = [
    {
      key: 'created',
      label: 'Pedido criado',
      done: true,
      current: !paid,
      at: order.createdAt,
    },
    {
      key: 'paid',
      label: paid ? 'Pagamento confirmado' : 'Aguardando pagamento',
      done: paid,
      current: !paid,
      at: order.paidAt,
    },
    {
      key: 'processing',
      label: 'Preparando envio',
      done: processing || shipped || delivered,
      current: paid && !shipped && !delivered && order.status !== 'PENDING',
      at: null,
    },
    {
      key: 'shipped',
      label: 'Enviado / em trânsito',
      done: shipped || delivered,
      current: shipped && !delivered,
      at: order.shippedAt,
    },
    {
      key: 'delivered',
      label: 'Entregue',
      done: delivered,
      current: delivered,
      at: delivered ? order.updatedAt : null,
    },
  ];

  let foundCurrent = false;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].current && !foundCurrent) {
      foundCurrent = true;
    } else if (foundCurrent) {
      steps[i].current = false;
    }
  }
  if (!foundCurrent) {
    const lastDone = [...steps].reverse().find((s) => s.done);
    if (lastDone) lastDone.current = true;
  }

  return steps;
}
