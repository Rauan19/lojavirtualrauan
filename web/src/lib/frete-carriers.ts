/**
 * Transportadoras comuns do Melhor Envio (espelho do backend).
 */
export const FRETE_CARRIER_OPTIONS = [
  { id: 'correios', label: 'Correios' },
  { id: 'jadlog', label: 'Jadlog' },
  { id: 'latam', label: 'LATAM Cargo' },
  { id: 'azul', label: 'Azul Cargo' },
  { id: 'loggi', label: 'Loggi' },
  { id: 'jet', label: 'JeT' },
  { id: 'buslog', label: 'Buslog' },
  { id: 'total', label: 'Total Express' },
  { id: 'via', label: 'Via Brasil' },
] as const;

export function asCarrierIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
}
