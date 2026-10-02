import type { ReactNode } from 'react';
import { CabecalhoPagina } from '@/components/admin/Pagina';

export type PlanState = 'ok' | 'expiring' | 'expired' | 'none';

export type StoreAdmin = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

export type StoreRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  storeType?: string;
  planName: string;
  planDueAt: string | null;
  monthlyFee?: string | number | null;
  sellerPhone?: string | null;
  daysLeft: number | null;
  planState: PlanState;
  admin: StoreAdmin | null;
  _count: { products: number; orders: number; customers: number };
};

export type BillingSummary = {
  mrr: number;
  potentialMrr: number;
  overdueAmount: number;
  trialAmount: number;
  storeCount: number;
  payingCount: number;
  byStatus: Record<string, { count: number; revenue: number }>;
  byPlan: Record<string, { count: number; revenue: number }>;
  monthlySeries: {
    month: string;
    label: string;
    mrr: number;
    stores: number;
  }[];
};

export type PlatformMpSettings = {
  mpAccessTokenSet: boolean;
  mpAccessTokenHint: string | null;
  mpPublicKeySet: boolean;
  mpPublicKeyHint: string | null;
  mpUseSandbox?: boolean;
  mpTestPayerEmail?: string | null;
  source: 'database' | 'env' | 'none';
  paymentsEnabled: boolean;
  billingWebhookUrl: string | null;
  liveMode: boolean | null;
  collectorIsTest?: boolean | null;
  subscriptionsReady?: boolean;
  subscriptionsHint?: string | null;
};

export const emptyCreateStore = {
  name: '',
  slug: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  planName: 'mensal',
  planDueAt: '',
  monthlyFee: '97',
  status: 'TRIAL',
  sellerDocType: '' as 'CPF' | 'CNPJ' | '',
  sellerDocument: '',
  sellerPhone: '',
  sellerZipCode: '',
  sellerStreet: '',
  sellerNumber: '',
  sellerComplement: '',
  sellerNeighborhood: '',
  sellerCity: '',
  sellerState: '',
};

export const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativa',
  TRIAL: 'Em teste',
  PAST_DUE: 'Em atraso',
  SUSPENDED: 'Suspensa',
};

export function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

/** Cor do selo de situação da loja (ativa, teste, em atraso, suspensa) */
export function statusTone(status: string) {
  if (status === 'ACTIVE') return 'bg-[#e8f6ee] text-[#1b8f4a]';
  if (status === 'TRIAL') return 'bg-[#eef2ff] text-[#3b4cca]';
  if (status === 'PAST_DUE') return 'bg-[#fff4e5] text-[#b54708]';
  if (status === 'SUSPENDED') return 'bg-[#fde8e8] text-[#b42318]';
  return 'bg-[#f0f1f3] text-[#5c6570]';
}

export function planBadge(store: StoreRow) {
  if (store.planState === 'expired') {
    return { text: 'Vencido', className: 'bg-[#fde8e8] text-[#b42318]' };
  }
  if (store.planState === 'expiring') {
    return {
      text: `${store.daysLeft} dia${store.daysLeft === 1 ? '' : 's'}`,
      className: 'bg-[#fff4e5] text-[#b54708]',
    };
  }
  if (store.planState === 'ok') {
    return {
      text: `${store.daysLeft} dias`,
      className: 'bg-[#e8f6ee] text-[#1b8f4a]',
    };
  }
  return { text: 'Sem vencimento', className: 'bg-[#f0f1f3] text-[#5c6570]' };
}

export function toInputDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function moneyBr(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function feeNumber(value: string | number | null | undefined) {
  if (value == null || value === '') return 0;
  return Number(value);
}

export function SuperSection({
  title,
  summary,
  icone,
  acoes,
  children,
}: {
  title: string;
  summary?: string;
  /** Endereço da tela no menu, para usar o mesmo ícone */
  icone?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-page">
      <CabecalhoPagina
        titulo={title}
        descricao={summary}
        icone={icone}
        acoes={acoes}
      />
      {children}
    </div>
  );
}
