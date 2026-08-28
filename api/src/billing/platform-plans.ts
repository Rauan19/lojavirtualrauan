export type PlatformPlan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  periodDays: number;
  highlight?: boolean;
  badge?: string;
  features?: string[];
};

/** Catálogo SaaS (todos mensais). Valores podem ser sobrescritos por env (JSON). */
export const DEFAULT_PLATFORM_PLANS: PlatformPlan[] = [
  {
    id: 'essencial',
    name: 'Essencial',
    description:
      'Ideal para loja menor, catálogo enxuto e começo sem complicação.',
    amount: 169.9,
    periodDays: 30,
    badge: 'Loja menor',
    features: [
      'Loja online completa',
      'Produtos, pedidos e frete',
      'Mercado Pago dos seus clientes',
      'Link da loja incluso (slug)',
      'Domínio próprio opcional — o registro do domínio é pago por você',
    ],
  },
  {
    id: 'mensal',
    name: 'Mensal',
    description: 'Para loja em crescimento que já vende com mais frequência.',
    amount: 199.9,
    periodDays: 30,
    highlight: true,
    badge: 'Mais escolhido',
    features: [
      'Tudo do Essencial',
      'Mais espaço pra crescer o catálogo',
      'Painel completo de vendas',
      'Link da loja incluso (slug)',
      'Domínio próprio opcional — o registro do domínio é pago por você',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Para loja maior, mais volume e operação no dia a dia.',
    amount: 297.9,
    periodDays: 30,
    badge: 'Loja maior',
    features: [
      'Tudo do Mensal',
      'Foco em operação com mais volume',
      'Prioridade no suporte',
      'Link da loja incluso (slug)',
      'Domínio próprio opcional — o registro do domínio é pago por você',
    ],
  },
];

export function parsePlatformPlansFromEnv(
  raw?: string | null,
): PlatformPlan[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as PlatformPlan[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.amount === 'number' &&
        typeof p.periodDays === 'number',
    );
  } catch {
    return null;
  }
}
