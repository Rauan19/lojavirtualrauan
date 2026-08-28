'use client';

import Link from 'next/link';
import { supportWhatsappHref } from '@/lib/contact';

type Props = {
  open: boolean;
  storeName?: string | null;
  storeSlug?: string | null;
  status?: string | null;
  planDueAt?: string | null;
  /** Na página de planos o modal não bloqueia — só avisa no topo se quiser */
  allowPlansPage?: boolean;
};

export function PlanRestrictionModal({
  open,
  storeName,
  storeSlug,
  status,
  planDueAt,
}: Props) {
  if (!open) return null;

  const dueLabel = planDueAt
    ? new Date(planDueAt).toLocaleDateString('pt-BR')
    : null;
  const suspended = status === 'SUSPENDED';
  // null quando a plataforma não configurou WhatsApp de suporte
  const supportHref = storeSlug
    ? supportWhatsappHref(storeName ?? undefined, storeSlug)
    : null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="plan-restriction-title"
      aria-describedby="plan-restriction-desc"
    >
      <div className="w-full max-w-md border border-line bg-white p-6 shadow-xl sm:rounded-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-700">
          Acesso restrito
        </p>
        <h2
          id="plan-restriction-title"
          className="mt-1 text-lg font-bold text-ink"
        >
          {suspended
            ? 'Loja suspensa'
            : 'Mensalidade vencida'}
        </h2>
        <p
          id="plan-restriction-desc"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          {suspended
            ? `A loja ${storeName || ''} está suspensa. Renove a mensalidade ou fale com o suporte para reativar o painel.`
            : `O período pago acabou${dueLabel ? ` em ${dueLabel}` : ''} e a renovação não foi confirmada. O painel fica bloqueado até você renovar a mensalidade.`}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link href="/admin/settings/planos" className="btn btn-accent text-center">
            Renovar mensalidade
          </Link>
          {supportHref ? (
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost text-center"
            >
              Falar com suporte
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
