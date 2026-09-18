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
    /*
     * Trajeto real da transportadora. Os passos acima sao os marcos da loja
     * (pago, enviado, entregue); isto aqui e onde a encomenda esteve, com
     * cidade — o que o cliente saia da loja para ver no site da transportadora.
     */
    shipmentEvents?: Array<{
      descricao: string;
      cidade?: string | null;
      uf?: string | null;
      ocorridoEm: string;
      origem: string;
    }> | null;
  };
};

function local(evento: { cidade?: string | null; uf?: string | null }) {
  return [evento.cidade, evento.uf].filter(Boolean).join('/');
}

export function OrderTrackingPanel({ order }: Props) {
  const steps = buildTrackingSteps(order);
  const trackUrl = resolveTrackingUrl(
    order.trackingCode,
    order.trackingUrl,
    order.shippingMethod,
  );
  const eventos = order.shipmentEvents || [];
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

      {eventos.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] font-bold uppercase text-muted">
            Trajeto da encomenda
          </p>
          <ol className="mt-2 space-y-2.5">
            {eventos.map((evento, i) => (
              <li
                key={`${evento.ocorridoEm}-${i}`}
                className="flex gap-2.5 text-sm"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    i === 0 ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span
                    className={`block leading-snug ${
                      i === 0 ? 'font-semibold' : ''
                    }`}
                  >
                    {evento.descricao}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {new Date(evento.ocorridoEm).toLocaleString('pt-BR')}
                    {local(evento) ? ` · ${local(evento)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

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
            {eventos.length > 0
              ? 'O trajeto acima é atualizado sozinho. Este link abre o rastreio completo na transportadora.'
              : 'Abre o rastreio da transportadora — igual Shopee / Mercado Livre.'}
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
