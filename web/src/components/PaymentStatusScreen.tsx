'use client';

import Link from 'next/link';
import { money } from '@/lib/api';

type Props = {
  mode: 'waiting' | 'success' | 'rejected';
  orderNumber?: string;
  total?: string | number;
  storeSlug: string;
  orderId: string;
  storeName?: string;
};

/**
 * Tela estilo marketplace: loading enquanto o webhook confirma o pagamento,
 * depois sucesso ou recusa.
 */
export function PaymentStatusScreen({
  mode,
  orderNumber,
  total,
  storeSlug,
  orderId,
  storeName,
}: Props) {
  if (mode === 'success') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10 text-center">
        <div className="pay-success-pop flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-emerald-800">
          Pronto! Pagamento aprovado
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {orderNumber
            ? `Sua compra #${orderNumber} foi confirmada`
            : 'Sua compra foi confirmada'}
          {total != null ? ` · ${money(total)}` : ''}.
          {storeName ? ` ${storeName} já pode preparar o envio.` : ''}
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <Link
            href={`/loja/${storeSlug}/conta/pedidos/${orderId}`}
            className="btn btn-accent inline-flex justify-center"
          >
            Ver compra e rastreio
          </Link>
          <Link
            href={`/loja/${storeSlug}`}
            className="btn btn-ghost inline-flex justify-center"
          >
            Continuar comprando
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'rejected') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-rose-800">
          Pagamento não aprovado
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Tente de novo com outro cartão, Pix ou meio de pagamento.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <Link
            href={`/loja/${storeSlug}/pedido/${orderId}`}
            className="btn btn-accent inline-flex justify-center"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('status');
              window.history.replaceState({}, '', url.pathname);
            }}
          >
            Tentar pagar de novo
          </Link>
          <Link
            href={`/loja/${storeSlug}`}
            className="btn btn-ghost inline-flex justify-center"
          >
            Voltar à loja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="pay-spin absolute inset-0 rounded-full border-[3px] border-[#3483fa] border-t-transparent" />
        <span className="pay-pulse absolute inset-3 rounded-full bg-[#3483fa]/10" />
        <svg
          className="relative text-[#3483fa]"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <rect
            x="3"
            y="6"
            width="18"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M3 10h18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h1 className="mt-8 text-xl font-bold text-ink sm:text-2xl">
        Estamos confirmando seu pagamento
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Assim que o pagamento for aprovado, sua compra aparece aqui na hora.
        Não feche esta página.
      </p>

      <div className="mt-6 flex items-center gap-1.5" aria-hidden>
        <span className="pay-dot h-2 w-2 rounded-full bg-[#3483fa]" />
        <span className="pay-dot pay-dot-2 h-2 w-2 rounded-full bg-[#3483fa]" />
        <span className="pay-dot pay-dot-3 h-2 w-2 rounded-full bg-[#3483fa]" />
      </div>

      {orderNumber ? (
        <p className="mt-6 text-xs text-muted">
          Pedido #{orderNumber}
          {total != null ? ` · ${money(total)}` : ''}
        </p>
      ) : null}

      <p className="mt-8 max-w-sm text-[11px] leading-relaxed text-muted">
        Pagou com Pix? A confirmação costuma chegar em poucos segundos. Cartão
        também pode levar um instante até o banco responder.
      </p>
    </div>
  );
}
