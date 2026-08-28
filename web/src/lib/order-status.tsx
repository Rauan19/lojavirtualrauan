export function orderStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: 'Aguardando pagamento',
    PAID: 'Pago',
    PROCESSING: 'Em separação',
    SHIPPED: 'Enviado',
    DELIVERED: 'Entregue',
    CANCELLED: 'Cancelado',
    REFUNDED: 'Reembolsado',
  };
  return map[status] || status;
}

export function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: 'Pagamento pendente',
    APPROVED: 'Pagamento aprovado',
    REJECTED: 'Pagamento recusado',
    REFUNDED: 'Pagamento estornado',
    CANCELLED: 'Pagamento cancelado',
  };
  return map[status] || status;
}

export function refundStatusLabel(status?: string | null) {
  if (!status) return null;
  const map: Record<string, string> = {
    REQUESTED: 'Reembolso solicitado',
    APPROVED: 'Reembolso aprovado',
    REJECTED: 'Reembolso recusado',
  };
  return map[status] || status;
}

export function orderStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
    PAID: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
    PROCESSING: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
    SHIPPED: 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300',
    DELIVERED: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
    CANCELLED: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
    REFUNDED: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300',
  };
  return map[status] || 'bg-zinc-100 text-zinc-800 ring-1 ring-zinc-300';
}

export function paymentStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    REJECTED: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
    REFUNDED: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200',
    CANCELLED: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
  };
  return map[status] || 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200';
}

export function StatusBadge({
  status,
  kind = 'order',
}: {
  status: string;
  kind?: 'order' | 'payment';
}) {
  const cls =
    kind === 'payment'
      ? paymentStatusBadgeClass(status)
      : orderStatusBadgeClass(status);
  const label =
    kind === 'payment' ? paymentStatusLabel(status) : orderStatusLabel(status);
  return (
    <span
      className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-bold leading-tight ${cls}`}
    >
      {label}
    </span>
  );
}
