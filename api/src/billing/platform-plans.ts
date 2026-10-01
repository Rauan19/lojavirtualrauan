export type PlatformPlan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  periodDays: number;
  highlight?: boolean;
  badge?: string;
  features?: string[];
  /** Máximo de produtos cadastrados. null/ausente = sem limite. */
  maxProducts?: number | null;
  /** Pessoas no painel, contando o dono. null = sem limite. */
  maxUsers?: number | null;
  /** NF-e/NFC-e liberada. Ausente = liberada. */
  nfeIncluded?: boolean;
  /** Comissão por venda em pontos-base (200 = 2%). Ausente = 0. */
  feeBps?: number;
  /** Domínio próprio liberado. Ausente = liberado. */
  customDomainIncluded?: boolean;
};

/**
 * Catálogo usado só quando a tabela PlatformPlan está vazia. O catálogo de
 * verdade vive no banco (editável pelo Super Admin) e é semeado pelas
 * migrations platform_plans e planos_com_limites, com os mesmos valores.
 */
export const DEFAULT_PLATFORM_PLANS: PlatformPlan[] = [
  {
    id: 'comeco',
    name: 'Começo',
    description: 'Para começar a vender sem mensalidade.',
    amount: 0,
    periodDays: 30,
    badge: 'Grátis',
    maxProducts: 50,
    maxUsers: 1,
    nfeIncluded: false,
    feeBps: 200,
    customDomainIncluded: false,
    features: [
      'Loja completa, sem mensalidade',
      'Até 50 produtos',
      'Taxa de 2% por venda',
    ],
  },
  {
    id: 'essencial',
    name: 'Essencial',
    description: 'Para começar a vender online com marca própria.',
    amount: 59.9,
    periodDays: 30,
    badge: 'Para começar',
    maxProducts: 300,
    maxUsers: 2,
    nfeIncluded: false,
    feeBps: 100,
    customDomainIncluded: true,
    features: [
      'Loja completa com domínio próprio',
      'Até 100 produtos',
      'Pix, cartão e boleto pelo Mercado Pago',
      'Frete pelo Melhor Envio com etiqueta e rastreio',
      'Cupons, promoções e avaliações',
    ],
  },
  {
    id: 'mensal',
    name: 'Profissional',
    description: 'Para a loja que já vende todo dia e emite nota.',
    amount: 129.9,
    periodDays: 30,
    badge: 'Mais escolhido',
    highlight: true,
    maxProducts: null,
    maxUsers: 3,
    nfeIncluded: true,
    feeBps: 50,
    customDomainIncluded: true,
    features: [
      'Tudo do Essencial',
      'Produtos ilimitados',
      'Nota fiscal automática (NF-e e NFC-e)',
    ],
  },
  {
    id: 'pro',
    name: 'Avançado',
    description: 'Para operação maior, com atendimento prioritário.',
    amount: 249.9,
    periodDays: 30,
    badge: 'Loja maior',
    maxProducts: null,
    maxUsers: 10,
    nfeIncluded: true,
    feeBps: 50,
    customDomainIncluded: true,
    features: [
      'Tudo do Profissional',
      'Suporte prioritário pelo WhatsApp',
      'Ajuda para configurar domínio, frete e nota fiscal',
    ],
  },
  {
    id: 'essencial-anual',
    name: 'Essencial',
    description: 'Pagamento anual. Equivale a R$ 49,92 por mês.',
    amount: 599,
    periodDays: 365,
    badge: '2 meses grátis',
    maxProducts: 300,
    maxUsers: 2,
    nfeIncluded: false,
    feeBps: 100,
    customDomainIncluded: true,
    features: [
      'Loja completa com domínio próprio',
      'Até 100 produtos',
      'Pix, cartão e boleto pelo Mercado Pago',
      'Frete pelo Melhor Envio com etiqueta e rastreio',
      'Cupons, promoções e avaliações',
    ],
  },
  {
    id: 'mensal-anual',
    name: 'Profissional',
    description: 'Pagamento anual. Equivale a R$ 108,25 por mês.',
    amount: 1299,
    periodDays: 365,
    badge: '2 meses grátis',
    highlight: true,
    maxProducts: null,
    maxUsers: 3,
    nfeIncluded: true,
    feeBps: 50,
    customDomainIncluded: true,
    features: [
      'Tudo do Essencial',
      'Produtos ilimitados',
      'Nota fiscal automática (NF-e e NFC-e)',
    ],
  },
  {
    id: 'pro-anual',
    name: 'Avançado',
    description: 'Pagamento anual. Equivale a R$ 208,25 por mês.',
    amount: 2499,
    periodDays: 365,
    badge: '2 meses grátis',
    maxProducts: null,
    maxUsers: 10,
    nfeIncluded: true,
    feeBps: 50,
    customDomainIncluded: true,
    features: [
      'Tudo do Profissional',
      'Suporte prioritário pelo WhatsApp',
      'Ajuda para configurar domínio, frete e nota fiscal',
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
