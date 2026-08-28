'use client';

import {
  buildTrackingSteps,
  resolveTrackingUrl,
} from '@/lib/tracking';

type Props = {
  order: {
    status: string;
    paymentStatus: string;
    createdAt: string;
    paidAt?: string | null;
    shippedAt?: string | null;
    updatedAt?: string;
    trackingCode?: string | null;
    trackingUrl?: string | null;
    shippingMethod?: string | null;
  };
};

export function OrderTrackingPanel({ order }: Props) {
  const steps = buildTrackingSteps(order);
  const trackUrl = resolveTrackingUrl(
    order.trackingCode,
    order.trackingUrl,
    order.shippingMethod,
  );
  const paid =
    order.paymentStatus === 'APPROVED' ||
    ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status);

  return (
    <div className="border border-line bg-white p-4">
      <h2 className="text-sm font-bold">Acompanhar pedido</h2>
      {order.shippingMethod ? (
        <p className="mt-1 text-xs text-muted">Frete: {order.shippingMethod}</p>
      ) : null}

      <ol className="relative mt-4 space-y-0 border-l-2 border-line pl-4">
        {steps.map((step) => (
          <li key={step.key} className="relative pb-4 last:pb-0">
            <span
              className={`absolute -left-[1.4rem] top-0.5 h-3 w-3 rounded-full ring-2 ring-white ${
                step.done
                  ? 'bg-emerald-500'
                  : step.current
                    ? 'bg-amber-400'
                    : 'bg-zinc-300'
              }`}
            />
            <p
              className={`text-sm font-medium ${
                step.done || step.current ? '' : 'text-muted'
              }`}
            >
              {step.label}
            </p>
            {step.at ? (
              <p className="text-[11px] text-muted">
                {new Date(step.at).toLocaleString('pt-BR')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {paid && order.trackingCode ? (
        <div className="mt-3 rounded border border-line bg-[#fafafa] p-3">
          <p className="text-[11px] font-bold uppercase text-muted">
            Código de rastreio
          </p>
          <p className="mt-1 font-mono text-sm font-bold tracking-wide">
            {order.trackingCode}
          </p>
          {trackUrl ? (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent mt-3 inline-flex w-full justify-center py-2 text-sm"
            >
              Ver onde está o pedido
            </a>
          ) : null}
          <p className="mt-2 text-[11px] text-muted">
            Abre o rastreio da transportadora — igual Shopee / Mercado Livre.
          </p>
        </div>
      ) : paid ? (
        <p className="mt-3 text-xs text-muted">
          Assim que a loja postar o pacote, o código de rastreio aparece aqui.
        </p>
      ) : (
        <p className="mt-3 text-xs text-amber-800">
          Conclua o pagamento para a loja preparar e enviar seu pedido.
        </p>
      )}
    </div>
  );
}
