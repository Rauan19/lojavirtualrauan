/**
 * Transportadoras comuns do Melhor Envio (e similares).
 * O filtro casa pelo nome da company retornado na cotação.
 */
export const FRETE_CARRIER_OPTIONS = [
  { id: 'correios', label: 'Correios', match: ['correios'] },
  { id: 'jadlog', label: 'Jadlog', match: ['jadlog'] },
  { id: 'latam', label: 'LATAM Cargo', match: ['latam'] },
  { id: 'azul', label: 'Azul Cargo', match: ['azul'] },
  { id: 'loggi', label: 'Loggi', match: ['loggi'] },
  { id: 'jet', label: 'JeT', match: ['jet', '.jet'] },
  { id: 'buslog', label: 'Buslog', match: ['buslog'] },
  {
    id: 'total',
    label: 'Total Express',
    match: ['total express', 'totalexpress'],
  },
  { id: 'via', label: 'Via Brasil', match: ['via brasil', 'viabrasil'] },
] as const;

export type FreteCarrierId = (typeof FRETE_CARRIER_OPTIONS)[number]['id'];

export function parseFreteTransportadoras(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) =>
      String(v || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

/** Vazio = todas. Caso contrário, mantém opções cuja company casa com algum id selecionado. */
export function filterShipOptionsByCarriers<
  T extends { company?: string; name?: string },
>(options: T[], selectedIds: string[]): T[] {
  const ids = selectedIds.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (ids.length === 0) return options;

  const matchers = FRETE_CARRIER_OPTIONS.filter((c) =>
    ids.includes(c.id),
  ).flatMap((c) => c.match.map((m) => m.toLowerCase()));

  // ids customizados (texto livre) também entram como match
  for (const id of ids) {
    if (!FRETE_CARRIER_OPTIONS.some((c) => c.id === id)) {
      matchers.push(id);
    }
  }

  if (matchers.length === 0) return options;

  return options.filter((o) => {
    const hay = `${o.company || ''} ${o.name || ''}`.toLowerCase();
    return matchers.some((m) => hay.includes(m));
  });
}
