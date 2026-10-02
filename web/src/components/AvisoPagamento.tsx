'use client';

import { useEffect, useRef } from 'react';

/** Motivos de recusa do cartão (status_detail do Mercado Pago) em português */
const MOTIVOS: Record<string, string> = {
  cc_rejected_insufficient_amount:
    'O cartão não tem limite suficiente para esta compra.',
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança (CVV).',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_call_for_authorize:
    'O banco pediu autorização para esta compra. Ligue para o banco e tente de novo.',
  cc_rejected_card_disabled:
    'O cartão está bloqueado. Fale com o banco ou use outro cartão.',
  cc_rejected_duplicated_payment:
    'Já existe um pagamento igual a este. Confira seus pedidos antes de tentar de novo.',
  cc_rejected_high_risk:
    'O pagamento não foi aprovado por segurança. Tente outro cartão ou o Pix.',
  cc_rejected_max_attempts:
    'Muitas tentativas com este cartão. Use outro cartão ou o Pix.',
  cc_rejected_blacklist:
    'Este cartão não pode ser usado. Tente outro cartão ou o Pix.',
  cc_rejected_other_reason:
    'O banco recusou o pagamento. Tente outro cartão ou o Pix.',
};

/** Texto para o cliente a partir do status_detail (ou a mensagem já pronta) */
export function motivoRecusa(detalhe?: string | null) {
  if (!detalhe)
    return 'O pagamento não foi aprovado. Tente outro cartão ou o Pix.';
  return (
    MOTIVOS[detalhe] ||
    (detalhe.includes('_') ? MOTIVOS.cc_rejected_other_reason : detalhe)
  );
}

/*
 * Aviso de pagamento não aprovado, no meio da tela (e não uma linha de erro
 * perdida no topo do checkout): o cliente precisa ver na hora que não pagou
 * e o que fazer. Fecha no botão, no X ou com Esc.
 */
export function AvisoPagamento({
  mensagem,
  onFechar,
}: {
  mensagem: string;
  onFechar: () => void;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  // ref: o pai passa uma função nova a cada render e o foco não pode pular
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    botao.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aviso-pagamento-titulo"
        aria-describedby="aviso-pagamento-texto"
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 text-center shadow-[0_30px_70px_-30px_rgba(0,0,0,0.55)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fde8e8] text-[#b42318]"
          aria-hidden
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 7.5v5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M12 16.5h.01"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <h2
          id="aviso-pagamento-titulo"
          className="mt-4 text-[18px] font-bold text-ink"
        >
          Pagamento não aprovado
        </h2>
        <p
          id="aviso-pagamento-texto"
          className="mt-2 text-[14px] leading-relaxed text-muted"
        >
          {mensagem}
        </p>
        <p className="mt-2 text-[13px] text-muted">Nenhum valor foi cobrado.</p>
        <button
          ref={botao}
          type="button"
          className="btn btn-accent mt-5 h-12 w-full text-[15px]"
          onClick={onFechar}
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
