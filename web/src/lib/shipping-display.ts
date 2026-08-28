const MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDay(d: Date) {
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/**
 * Texto amigável para o cliente (sem nome da transportadora).
 * Usa a previsão da transportadora como janela: chega entre (dias−2) e (dias+1).
 */
export function formatDeliveryEstimate(days: number): string {
  const n = Math.max(1, Math.round(days));
  const today = new Date();
  const from = addDays(today, Math.max(1, n - 2));
  const to = addDays(today, n + 1);

  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `Chega entre ${from.getDate()} e ${to.getDate()} de ${MONTHS[from.getMonth()]}`;
  }

  return `Chega entre ${formatDay(from)} e ${formatDay(to)}`;
}

export function formatDeliveryDaysHint(days: number): string {
  const n = Math.max(1, Math.round(days));
  const min = Math.max(1, n - 2);
  const max = n + 1;
  if (min === max) return `${min} dia útil`;
  return `${min} a ${max} dias úteis`;
}
