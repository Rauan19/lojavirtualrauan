'use client';

import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, mediaUrl } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { formatPhoneBr } from '@/lib/contact';
import {
  FRETE_CARRIER_OPTIONS,
  asCarrierIds,
} from '@/lib/frete-carriers';
import { STORE_CARD_RATIOS, STORE_FONTS } from '@/lib/store-theme';

type Store = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customDomain?: string | null;
  status?: string;
  planName?: string;
  planDueAt?: string | null;
  monthlyFee?: string | number | null;
  daysLeft?: number | null;
  planState?: 'ok' | 'expiring' | 'expired' | 'none';
  mpPublicKey?: string | null;
  mpAccessTokenSet?: boolean;
  mpAccessTokenHint?: string | null;
  mpPublicKeyHint?: string | null;
  checkoutMode?: string;
  mpWebhookUrl?: string | null;
  freteModo: string;
  freteValorFixo?: string | null;
  freteGratisAcima?: string | null;
  freteTokenSet?: boolean;
  freteOauthConectado?: boolean;
  freteContaNome?: string | null;
  freteContaEmail?: string | null;
  freteCepOrigem?: string | null;
  freteRuaOrigem?: string | null;
  freteNumeroOrigem?: string | null;
  freteComplementoOrigem?: string | null;
  freteBairroOrigem?: string | null;
  freteCidadeOrigem?: string | null;
  freteUfOrigem?: string | null;
  freteSandbox?: boolean;
  freteEmailContato?: string | null;
  freteEtiquetaAuto?: boolean;
  /** Slugs liberados no checkout. [] = todas. */
  freteTransportadoras?: string[] | null;
  marqueeEnabled?: boolean;
  marqueeImages?: string[] | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  storeType?: string | null;
  storeFont?: string | null;
  storeCardRatio?: string | null;
  analyticsGaId?: string | null;
  analyticsPixelId?: string | null;
  sellerDocType?: 'CPF' | 'CNPJ' | null;
  sellerDocument?: string | null;
  sellerLegalName?: string | null;
  sellerTradeName?: string | null;
  sellerIe?: string | null;
  sellerIm?: string | null;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerZipCode?: string | null;
  sellerStreet?: string | null;
  sellerNumber?: string | null;
  sellerComplement?: string | null;
  sellerNeighborhood?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  termsHtml?: string | null;
  privacyHtml?: string | null;
  returnsHtml?: string | null;
  nfeEnabled?: boolean;
  nfeEnvironment?: string | null;
  nfeApiTokenSet?: boolean;
  nfeSeries?: string | null;
  nfeCscId?: string | null;
  nfeCscTokenSet?: boolean;
};

function asImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function hasOriginAddress(store: Store | null): boolean {
  if (!store) return false;
  const cep = (store.freteCepOrigem || '').replace(/\D/g, '');
  return (
    cep.length === 8 &&
    Boolean(store.freteRuaOrigem?.trim()) &&
    Boolean(store.freteNumeroOrigem?.trim()) &&
    Boolean(store.freteBairroOrigem?.trim()) &&
    Boolean(store.freteCidadeOrigem?.trim()) &&
    Boolean(store.freteUfOrigem?.trim()) &&
    (store.freteUfOrigem || '').trim().length === 2
  );
}

function SettingsPanel({
  id,
  title,
  summary,
  badge,
  open,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  summary: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden border border-line bg-white"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-[#fafafa]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        {badge ? <div className="shrink-0 pt-0.5">{badge}</div> : null}
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-line text-sm font-bold text-muted"
          aria-hidden
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-line px-4 py-4">{children}</div>
      ) : null}
    </section>
  );
}

/**
 * O que precisa estar preenchido para o botão "Gerar etiqueta" funcionar.
 *
 * Cada item aqui corresponde a uma checagem que hoje só falha no clique, uma
 * de cada vez: o lojista configura, tenta, lê o erro, volta, configura outra
 * coisa. Mostrar a lista antes troca quatro idas e voltas por uma.
 */
const ETIQUETA_REQUISITOS = [
  {
    id: 'conta',
    rotulo: 'Conta da transportadora conectada',
    pronto: (s: Store) => Boolean(s.freteOauthConectado || s.freteTokenSet),
    resolver: (abrirFrete: (m: 'conexao') => void) => abrirFrete('conexao'),
  },
  {
    id: 'email',
    rotulo: 'E-mail de contato da loja',
    pronto: (s: Store) => Boolean(s.freteEmailContato?.trim()),
    resolver: (abrirFrete: (m: 'conexao') => void) => abrirFrete('conexao'),
  },
  {
    id: 'origem',
    rotulo: 'Endereço de origem completo',
    pronto: (_s: Store, origemOk?: boolean) => Boolean(origemOk),
    resolver: (abrirFrete: (m: 'origem') => void) => abrirFrete('origem'),
  },
  {
    id: 'documento',
    rotulo: 'CPF ou CNPJ do lojista (remetente da etiqueta)',
    pronto: (s: Store) => Boolean(s.sellerDocument?.trim()),
    resolver: (
      _abrirFrete: (m: never) => void,
      irParaDocumento: () => void,
    ) => irParaDocumento(),
  },
] as const;

const FRETE_MODAL_TITULO: Record<string, string> = {
  calculo: 'Como calcular o frete',
  origem: 'Endereço de origem',
  conexao: 'Conta da transportadora',
  etiqueta: 'Etiqueta e transportadoras',
};

const FRETE_MODAL_HINT: Record<string, string> = {
  calculo:
    'Define o que o cliente vê no checkout: um valor definido por você ou a cotação real da transportadora.',
  origem:
    'De onde a encomenda sai. O frete é calculado entre este CEP e o do cliente — sem ele a cotação não funciona.',
  conexao:
    'O acesso à conta que cota o frete e compra a etiqueta. Só você mexe aqui; o cliente nunca vê.',
  etiqueta:
    'O que acontece depois do pagamento aprovado, e quais opções de entrega aparecem no checkout.',
};

const STORE_TYPE_LABEL: Record<string, string> = {
  GENERAL: 'Geral / variedades',
  FASHION: 'Moda e roupas',
  SHOES: 'Calçados',
  ELECTRONICS: 'Eletrônicos e acessórios',
  CUSTOM: 'Personalizado',
};

const IDENT_MODAL_TITULO: Record<string, string> = {
  nome: 'Nome e endereço',
  logo: 'Logo da loja',
  cores: 'Cores da marca',
  aparencia: 'Aparência da vitrine',
  redes: 'Redes sociais',
  audiencia: 'Medição de audiência',
};

const IDENT_MODAL_HINT: Record<string, string> = {
  nome: 'Como a loja se chama e por qual endereço o cliente chega até ela.',
  logo: 'Aparece no topo da vitrine e na prévia de quando alguém compartilha o link.',
  cores: 'Duas cores sustentam a vitrine inteira.',
  aparencia:
    'O ramo já traz um preset pronto; os outros campos são o ajuste fino de quem quer fugir dele.',
  redes: 'Links do rodapé da loja. Só os preenchidos aparecem.',
  audiencia:
    'Opcional — e é o que liga o aviso de cookies na vitrine. Em branco, ele nem aparece.',
};

const POLITICAS = [
  {
    campo: 'termsHtml' as const,
    rota: 'termos',
    titulo: 'Termos de uso',
    hint: 'Condições de venda, pagamento e entrega. É a página que o cliente aceita no checkout.',
    exemplo: '<p>Ao comprar nesta loja, você concorda com...</p>',
  },
  {
    campo: 'privacyHtml' as const,
    rota: 'privacidade',
    titulo: 'Política de privacidade',
    hint: 'Como os dados do cliente são coletados e tratados. Exigida pela LGPD.',
    exemplo: '<p>Os dados informados são usados para...</p>',
  },
  {
    campo: 'returnsHtml' as const,
    rota: 'trocas',
    titulo: 'Trocas e devoluções',
    hint: 'Prazos e condições. O Código de Defesa do Consumidor garante 7 dias para compra online.',
    exemplo: '<p>Você pode solicitar a troca em até...</p>',
  },
];

const PAGAMENTO_MODAL_TITULO: Record<string, string> = {
  modelo: 'Modelo de checkout',
  credenciais: 'Credenciais do Mercado Pago',
  webhook: 'Webhook de pagamento',
};

const PAGAMENTO_MODAL_HINT: Record<string, string> = {
  modelo: 'Onde o cliente digita o cartão: dentro da sua loja ou no site do Mercado Pago.',
  credenciais:
    'Da sua conta, não da plataforma — é para ela que o dinheiro das vendas vai.',
  webhook: 'A URL que o Mercado Pago chama para avisar que um pagamento mudou.',
};

const PERFIL_MODAL_TITULO: Record<string, string> = {
  documento: 'Quem emite a venda',
  contato: 'Contato',
  endereco: 'Endereço do emitente',
};

const PERFIL_MODAL_HINT: Record<string, string> = {
  documento:
    'Dados do titular da loja. Aparecem na nota fiscal e nas páginas de política.',
  contato: 'Por onde o cliente e o fisco falam com a loja.',
  endereco:
    'Endereço fiscal do titular — é outro campo, diferente do endereço de origem do frete.',
};

function IconNota() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.5V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 11.5h6M9 15h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChave() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <circle cx="8" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11.5 12H21m-3 0v3m-3-3v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconIdentidade() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="11" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconContato() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M5 4.5h3l1.5 4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5C9.6 18.6 5.4 14.4 4.5 6.1A1.5 1.5 0 0 1 5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCartao() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="3"
        y="5.5"
        width="18"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 14.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckout() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M4 5h2l2.2 9.6a1.5 1.5 0 0 0 1.5 1.2h7.1a1.5 1.5 0 0 0 1.5-1.1L20 8H6.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19" r="1.3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="19" r="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconWebhook() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <circle cx="12" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="17" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="17" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.7 9.3-2.6 5.2M13.3 9.3l2.6 5.2M9.1 17h5.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDocumento() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8L13.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 3v5h5M9 12.5h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCarrossel() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="6.5"
        y="6"
        width="11"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 8.5v7M20.5 8.5v7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMais() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M12 5.5v13M5.5 12h13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLoja() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M4 9.5V20h16V9.5M3 9.5 5 4h14l2 5.5a3 3 0 0 1-5.4 1.8A3 3 0 0 1 12 12a3 3 0 0 1-3.6-.7A3 3 0 0 1 3 9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconImagem() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m4 17 4.5-4.5 3.5 3.5 3-3 5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconVitrine() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3.5 9h17" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 9v10.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconRedes() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="6.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m8.2 10.9 6.6-3.3M8.2 13.1l6.6 3.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function IconGrafico() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M4 20V4M4 20h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 16v-4m4 4V8m4 8v-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCalculo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <rect
        x="4.5"
        y="3"
        width="15"
        height="18"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 7.5h8M8 12h2m3 0h3m-8 4h2m3 0h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconOrigem() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="2.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* Caixa em perspectiva — marca visual da transportadora sem usar logo de terceiro. */
function IconPacote() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M3.5 7.4 12 3l8.5 4.4v9.2L12 21l-8.5-4.4V7.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m3.5 7.4 8.5 4.4 8.5-4.4M12 11.8V21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEtiqueta() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M12.6 3.5H20v7.4l-9 9a1.6 1.6 0 0 1-2.3 0l-5.1-5.1a1.6 1.6 0 0 1 0-2.3l9-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="16.2" cy="7.3" r="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Linha de resumo de uma configuração: o estado atual à esquerda, a entrada
 * para editar à direita.
 *
 * A seção mostrava o formulário inteiro aberto — dezenas de campos de quatro
 * assuntos diferentes empilhados. Aqui o lojista lê o que está valendo hoje e
 * só abre o que vai mexer.
 */
function SettingsRow({
  icon,
  title,
  value,
  tone = 'neutro',
  cta = 'Ajustar',
  onEdit,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  tone?: 'neutro' | 'ok' | 'pendente';
  cta?: string;
  onEdit: () => void;
}) {
  const toneClass =
    tone === 'pendente'
      ? 'text-accent'
      : tone === 'ok'
        ? 'text-[var(--ok)]'
        : 'text-muted';

  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-center gap-3 border border-line bg-white px-3.5 py-3 text-left transition hover:border-ink/25 hover:bg-[#fafafa]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className={`mt-0.5 block truncate text-xs ${toneClass}`}>
          {value}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-muted group-hover:text-ink">
        {cta}
      </span>
    </button>
  );
}

/** Caixa de edição de um assunto só. Mesmo formato do modal de origem. */
function SettingsModal({
  title,
  hint,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md">
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{title}</h2>
            {hint ? (
              <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn shrink-0"
            onClick={onClose}
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default function AdminSettingsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [freteToken, setFreteToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadingMarquee, setUploadingMarquee] = useState(false);
  const [originModalOpen, setOriginModalOpen] = useState(false);
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [openSection, setOpenSection] = useState<
    | 'branding'
    | 'marquee'
    | 'shipping'
    | 'payments'
    | 'plan'
    | 'profile'
    | 'policies'
    | 'nfe'
    | null
  >(null);
  const [nfeApiToken, setNfeApiToken] = useState('');
  const [nfeCscToken, setNfeCscToken] = useState('');
  const [meHelpOpen, setMeHelpOpen] = useState(false);
  const [meBusy, setMeBusy] = useState(false);
  const [freteModal, setFreteModal] = useState<
    'calculo' | 'origem' | 'conexao' | 'etiqueta' | null
  >(null);
  const [identModal, setIdentModal] = useState<
    'nome' | 'logo' | 'cores' | 'aparencia' | 'redes' | 'audiencia' | null
  >(null);
  const [politicaModal, setPoliticaModal] = useState<
    'termsHtml' | 'privacyHtml' | 'returnsHtml' | null
  >(null);
  const [pagamentoModal, setPagamentoModal] = useState<
    'modelo' | 'credenciais' | 'webhook' | null
  >(null);
  const [perfilModal, setPerfilModal] = useState<
    'documento' | 'contato' | 'endereco' | null
  >(null);
  const [nfeModal, setNfeModal] = useState<'emissao' | 'credenciais' | null>(
    null,
  );

  function toggleSection(
    id:
      | 'branding'
      | 'marquee'
      | 'shipping'
      | 'payments'
      | 'plan'
      | 'profile'
      | 'policies'
      | 'nfe',
  ) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  const auth = () => {
    const user = getUser();
    return { token: getToken(), storeSlug: user?.store?.slug };
  };

  /*
   * A autorizacao acontece no site do Melhor Envio, entao saimos da pagina.
   * A API monta a URL porque so ela conhece o client_id e assina o `state`
   * que amarra a volta a esta loja.
   */
  async function conectarMelhorEnvio() {
    const { token, storeSlug } = auth();
    if (!token) return;
    setMeBusy(true);
    setError('');
    try {
      const { url } = await api<{ url: string }>(
        '/admin/shipping/melhor-envio/authorize',
        { token, storeSlug },
      );
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao abrir o Melhor Envio',
      );
      setMeBusy(false);
    }
  }

  async function desconectarMelhorEnvio() {
    const { token, storeSlug } = auth();
    if (!token) return;
    setMeBusy(true);
    setError('');
    try {
      await api('/admin/shipping/melhor-envio/disconnect', {
        method: 'POST',
        token,
        storeSlug,
      });
      const atualizada = await api<Store>('/stores/me', { token, storeSlug });
      setStore(atualizada);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar');
    } finally {
      setMeBusy(false);
    }
  }

  /* Volta do Melhor Envio: o callback redireciona para ca com o resultado. */
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get(
      'melhorenvio',
    );
    if (!status) return;
    if (status === 'conectado') {
      setMessage('Melhor Envio conectado.');
    } else {
      setError('Nao foi possivel conectar ao Melhor Envio. Tente de novo.');
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const { token, storeSlug } = auth();
    if (!token) return;
    api<Store>('/stores/me', { token, storeSlug })
      .then((s) => {
        const next = {
          ...s,
          sellerPhone: s.sellerPhone ? formatPhoneBr(s.sellerPhone) : s.sellerPhone,
          marqueeEnabled: s.marqueeEnabled !== false,
          marqueeImages: asImages(s.marqueeImages),
          freteTransportadoras: asCarrierIds(s.freteTransportadoras),
        };
        setStore(next);
        setMpPublicKey(s.mpPublicKey || '');
        if (!hasOriginAddress(next)) {
          setOriginModalOpen(true);
          setOpenSection('shipping');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, []);

  useEffect(() => {
    if (!originModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [originModalOpen]);

  async function patchBranding(body: Record<string, unknown>) {
    const { token, storeSlug } = auth();
    if (!store || !token) return null;
    return api<Store>('/stores/me/branding', {
      method: 'PATCH',
      token,
      storeSlug,
      body,
    });
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const updated = await api<Store>('/stores/me/profile', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          // Ramo da loja fica em Identidade visual: mandar daqui desfazia a
          // escolha de estilo toda vez que o lojista salvasse o endereço.
          sellerDocType: store.sellerDocType || null,
          sellerDocument: store.sellerDocument || null,
          sellerLegalName: store.sellerLegalName || null,
          sellerTradeName: store.sellerTradeName || null,
          sellerIe: store.sellerIe || null,
          sellerIm: store.sellerIm || null,
          sellerPhone: store.sellerPhone || null,
          sellerEmail: store.sellerEmail || null,
          sellerZipCode: store.sellerZipCode || null,
          sellerStreet: store.sellerStreet || null,
          sellerNumber: store.sellerNumber || null,
          sellerComplement: store.sellerComplement || null,
          sellerNeighborhood: store.sellerNeighborhood || null,
          sellerCity: store.sellerCity || null,
          sellerState: store.sellerState || null,
        },
      });
      setStore({
        ...updated,
        sellerPhone: updated.sellerPhone
          ? formatPhoneBr(updated.sellerPhone)
          : updated.sellerPhone,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setMessage('Perfil da loja salvo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil');
    }
  }

  async function savePolicies(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const updated = await api<Store>('/stores/me/policies', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          termsHtml: store.termsHtml || null,
          privacyHtml: store.privacyHtml || null,
          returnsHtml: store.returnsHtml || null,
        },
      });
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setMessage('Políticas salvas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar políticas');
    }
  }

  async function saveNfe(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setError('');
    setMessage('');
    try {
      const { token, storeSlug } = auth();
      if (!token) return;
      const body: Record<string, unknown> = {
        nfeEnabled: !!store.nfeEnabled,
        nfeEnvironment: store.nfeEnvironment || 'homologacao',
        nfeSeries: store.nfeSeries || undefined,
        nfeCscId: store.nfeCscId || null,
      };
      if (nfeApiToken.trim()) body.nfeApiToken = nfeApiToken.trim();
      if (nfeCscToken.trim()) body.nfeCscToken = nfeCscToken.trim();
      const updated = await api<Store>('/stores/me/nfe', {
        method: 'PATCH',
        token,
        storeSlug,
        body,
      });
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
      setNfeApiToken('');
      setNfeCscToken('');
      setMessage('Configuração de NFC-e salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar NFC-e');
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    try {
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        storeType: store.storeType || undefined,
        storeFont: store.storeFont ?? '',
        storeCardRatio: store.storeCardRatio ?? '',
        analyticsGaId: store.analyticsGaId ?? '',
        analyticsPixelId: store.analyticsPixelId ?? '',
        marqueeEnabled: store.marqueeEnabled !== false,
        marqueeImages: asImages(store.marqueeImages),
        instagramUrl: store.instagramUrl || '',
        facebookUrl: store.facebookUrl || '',
        tiktokUrl: store.tiktokUrl || '',
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Identidade salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function uploadLogo(file: File) {
    const { token, storeSlug } = auth();
    if (!token || !storeSlug || !store) return;
    setError('');
    setMessage('');
    const formData = new FormData();
    formData.append('file', file);
    const uploaded = await api<{ path: string }>('/admin/uploads', {
      method: 'POST',
      token,
      storeSlug,
      formData,
    });
    const updated = await patchBranding({
      name: store.name,
      logoUrl: uploaded.path,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
      accentColor: store.accentColor,
      customDomain: store.customDomain || undefined,
      marqueeEnabled: store.marqueeEnabled !== false,
      marqueeImages: asImages(store.marqueeImages),
    });
    if (updated) {
      setStore({
        ...updated,
        marqueeImages: asImages(updated.marqueeImages),
      });
    }
    setMessage('Logo atualizada na vitrine');
  }

  async function uploadMarquee(file: File) {
    const { token, storeSlug } = auth();
    if (!token || !storeSlug || !store) return;
    const current = asImages(store.marqueeImages);
    if (current.length >= 12) {
      setError('Máximo de 12 fotos no marquee');
      return;
    }
    setUploadingMarquee(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await api<{ path: string }>('/admin/uploads', {
        method: 'POST',
        token,
        storeSlug,
        formData,
      });
      const next = [...current, uploaded.path];
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        marqueeEnabled: true,
        marqueeImages: next,
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeEnabled: true,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Foto adicionada ao marquee');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploadingMarquee(false);
    }
  }

  async function removeMarqueeImage(path: string) {
    if (!store) return;
    const next = asImages(store.marqueeImages).filter((p) => p !== path);
    try {
      const updated = await patchBranding({
        name: store.name,
        logoUrl: store.logoUrl,
        primaryColor: store.primaryColor,
        secondaryColor: store.secondaryColor,
        accentColor: store.accentColor,
        customDomain: store.customDomain || undefined,
        marqueeEnabled: store.marqueeEnabled !== false,
        marqueeImages: next,
      });
      if (updated) {
        setStore({
          ...updated,
          marqueeImages: asImages(updated.marqueeImages),
        });
      }
      setMessage('Foto removida');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function saveMp(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const { token, storeSlug } = auth();
    setError('');
    setMessage('');
    try {
      if (!store.mpAccessTokenSet && !mpAccessToken.trim()) {
        setError('Cole o Access Token do Mercado Pago para salvar.');
        return;
      }
      if (!mpPublicKey.trim() && !store.mpPublicKey) {
        setError('Cole a Public Key do Mercado Pago para salvar.');
        return;
      }
      const updated = await api<Store>('/stores/me/mercadopago', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          ...(mpAccessToken.trim()
            ? { mpAccessToken: mpAccessToken.trim() }
            : {}),
          ...(mpPublicKey.trim() ? { mpPublicKey: mpPublicKey.trim() } : {}),
          checkoutMode: store.checkoutMode || 'personalized',
        },
      });
      setStore({
        ...store,
        ...updated,
        marqueeImages: asImages(updated.marqueeImages ?? store.marqueeImages),
      });
      setMpAccessToken('');
      setMessage(
        updated.mpAccessTokenHint
          ? `Salvo! Token gravado (${updated.mpAccessTokenHint}). O campo fica vazio de propósito — o segredo não aparece de novo.`
          : 'Mercado Pago salvo',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    }
  }

  async function testMp() {
    if (!store) return;
    const { token, storeSlug } = auth();
    setError('');
    setMessage('');
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        nickname?: string | null;
        email?: string | null;
        mpUserId?: number | string | null;
        tip?: string;
      }>('/stores/me/mercadopago/test', {
        method: 'POST',
        token,
        storeSlug,
      });
      setMessage(
        `${res.message}${res.nickname ? ` · conta: ${res.nickname}` : ''}${
          res.email ? ` (${res.email})` : ''
        }. ${res.tip || ''}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao testar');
    }
  }

  async function lookupOriginCep(digits: string) {
    if (!store || digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) return;
      setStore((prev) =>
        prev
          ? {
              ...prev,
              freteRuaOrigem: data.logradouro || prev.freteRuaOrigem || '',
              freteBairroOrigem: data.bairro || prev.freteBairroOrigem || '',
              freteCidadeOrigem: data.localidade || prev.freteCidadeOrigem || '',
              freteUfOrigem: data.uf || prev.freteUfOrigem || '',
            }
          : prev,
      );
    } catch {
      /* ViaCEP offline — admin preenche manual */
    }
  }

  async function saveShipping(e?: FormEvent) {
    e?.preventDefault();
    if (!store) return false;
    const { token, storeSlug } = auth();
    if (!hasOriginAddress(store)) {
      setError(
        'Cadastre o endereço completo de origem (CEP, rua, número, bairro, cidade e UF). O frete usa esse CEP + o CEP do cliente.',
      );
      setOriginModalOpen(true);
      return false;
    }
    try {
      const updated = await api<Store>('/stores/me/shipping', {
        method: 'PATCH',
        token,
        storeSlug,
        body: {
          freteModo: store.freteModo || 'manual',
          freteValorFixo: store.freteValorFixo
            ? Number(store.freteValorFixo)
            : undefined,
          freteGratisAcima:
            store.freteGratisAcima && Number(store.freteGratisAcima) > 0
              ? Number(store.freteGratisAcima)
              : null,
          freteToken: freteToken.trim() || undefined,
          freteCepOrigem: store.freteCepOrigem || null,
          freteRuaOrigem: store.freteRuaOrigem || null,
          freteNumeroOrigem: store.freteNumeroOrigem || null,
          freteComplementoOrigem: store.freteComplementoOrigem || null,
          freteBairroOrigem: store.freteBairroOrigem || null,
          freteCidadeOrigem: store.freteCidadeOrigem || null,
          freteUfOrigem: store.freteUfOrigem || null,
          freteSandbox: store.freteSandbox === true,
          freteEmailContato: store.freteEmailContato || null,
          freteEtiquetaAuto: store.freteEtiquetaAuto === true,
          freteTransportadoras: asCarrierIds(store.freteTransportadoras),
        },
      });
      setStore({
        ...store,
        ...updated,
        freteTransportadoras: asCarrierIds(
          updated.freteTransportadoras ?? store.freteTransportadoras,
        ),
        marqueeImages: asImages(updated.marqueeImages ?? store.marqueeImages),
      });
      setFreteToken('');
      setMessage('Frete e endereço de origem salvos');
      setError('');
      setOriginModalOpen(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
      return false;
    }
  }

  async function saveOriginFromModal(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    setSavingOrigin(true);
    setError('');
    try {
      await saveShipping();
    } finally {
      setSavingOrigin(false);
    }
  }

  if (!store) return <p className="text-muted">Carregando...</p>;

  const logo = mediaUrl(store.logoUrl);
  const marquee = asImages(store.marqueeImages);
  const originReady = hasOriginAddress(store);

  /*
   * Resumo que cada linha da seção de frete mostra fechada. É o que responde
   * "está tudo certo?" sem precisar abrir formulário nenhum.
   */
  const freteViaTransportadora = ['melhor_envio', 'frenet', 'superfrete'].includes(
    store.freteModo || '',
  );
  const freteConectado = Boolean(store.freteOauthConectado || store.freteTokenSet);
  const transportadorasEscolhidas = asCarrierIds(store.freteTransportadoras);

  const identResumo = {
    aparencia: [
      STORE_TYPE_LABEL[store.storeType || 'GENERAL'] || 'Geral / variedades',
      store.storeCardRatio || store.storeFont ? 'ajustada' : 'preset do ramo',
    ].join(' · '),
    redes:
      [store.instagramUrl, store.facebookUrl, store.tiktokUrl].filter((u) =>
        u?.trim(),
      ).length > 0
        ? `${
            [store.instagramUrl, store.facebookUrl, store.tiktokUrl].filter((u) =>
              u?.trim(),
            ).length
          } rede(s) no rodapé`
        : 'Nenhuma cadastrada',
    audiencia: [
      store.analyticsGaId?.trim() ? 'Google Analytics' : null,
      store.analyticsPixelId?.trim() ? 'Meta Pixel' : null,
    ]
      .filter(Boolean)
      .join(' + ') || 'Não configurado · sem aviso de cookies',
  };

  /*
   * Pendências que travam a emissão de etiqueta. Só faz sentido quando a loja
   * cota por transportadora — em frete fixo nada disso é usado.
   */
  const etiquetaPendencias = ETIQUETA_REQUISITOS.filter(
    (req) => !req.pronto(store, originReady),
  );

  /** O documento mora em outra seção; abrir direto no lugar certo. */
  const irParaDocumento = () => {
    setOpenSection('profile');
    setPerfilModal('documento');
  };

  const perfilResumo = {
    documento: store.sellerDocument
      ? `${store.sellerDocType || 'Documento'} ${store.sellerDocument}${
          store.sellerLegalName ? ` · ${store.sellerLegalName}` : ''
        }`
      : 'Pendente — exigido para emitir nota',
    contato:
      [store.sellerPhone, store.sellerEmail].filter((v) => v?.trim()).join(' · ') ||
      'Nenhum contato informado',
    endereco: store.sellerZipCode
      ? `${store.sellerStreet || ''}, ${store.sellerNumber || ''} · ${
          store.sellerCity || ''
        }/${store.sellerState || ''}`
      : 'Não informado',
  };

  const freteResumo = {
    calculo:
      store.freteModo === 'gratis'
        ? 'Sempre grátis'
        : store.freteModo === 'manual'
          ? `Tabela própria · R$ ${store.freteValorFixo ?? '25'}`
          : store.freteModo === 'frenet'
            ? 'Cotação da Frenet'
            : store.freteModo === 'superfrete'
              ? 'Cotação da SuperFrete'
              : 'Cotação do Melhor Envio',
    origem: originReady
      ? `${store.freteRuaOrigem ?? ''}, ${store.freteNumeroOrigem ?? ''} · ${
          store.freteCidadeOrigem ?? ''
        }/${store.freteUfOrigem ?? ''}`
      : 'Pendente — sem isso o frete não calcula',
    conexao: store.freteOauthConectado
      ? `Conectado · ${store.freteContaNome || 'conta autorizada'}`
      : store.freteTokenSet
        ? 'Token colado na mão · vence em 30 dias'
        : 'Não conectado',
    etiqueta: `${
      store.freteEtiquetaAuto ? 'Etiqueta automática ligada' : 'Etiqueta manual'
    } · ${
      transportadorasEscolhidas.length
        ? `${transportadorasEscolhidas.length} transportadora(s)`
        : 'todas as transportadoras'
    }`,
  };

  function setOriginField<K extends keyof Store>(key: K, value: Store[K]) {
    setStore((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="admin-page">
      {originModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="origin-modal-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden border border-line bg-white shadow-xl sm:rounded-md">
            <div className="border-b border-line px-4 py-3">
              <h2 id="origin-modal-title" className="text-base font-bold">
                Cadastre o endereço da loja primeiro
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                O frete no checkout é calculado entre o <strong>CEP de origem</strong>{' '}
                (de onde você envia) e o <strong>CEP do cliente</strong>. Sem o
                seu endereço, a cotação não funciona direito.
              </p>
            </div>

            <form
              onSubmit={saveOriginFromModal}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="grid grid-cols-1 gap-3 overflow-y-auto px-4 py-4 sm:grid-cols-2">
                <div>
                  <label className="label">CEP de origem</label>
                  <input
                    className="field"
                    value={store.freteCepOrigem ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digits = raw.replace(/\D/g, '').slice(0, 8);
                      setOriginField('freteCepOrigem', raw);
                      void lookupOriginCep(digits);
                    }}
                    placeholder="00000-000"
                    inputMode="numeric"
                    required
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Digite o CEP — rua, bairro, cidade e UF preenchem sozinhos.
                  </p>
                </div>
                <div>
                  <label className="label">Número</label>
                  <input
                    className="field"
                    value={store.freteNumeroOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteNumeroOrigem', e.target.value)
                    }
                    placeholder="123"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Rua / logradouro</label>
                  <input
                    className="field"
                    value={store.freteRuaOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteRuaOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">Complemento</label>
                  <input
                    className="field"
                    value={store.freteComplementoOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteComplementoOrigem', e.target.value)
                    }
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="label">Bairro</label>
                  <input
                    className="field"
                    value={store.freteBairroOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteBairroOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input
                    className="field"
                    value={store.freteCidadeOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField('freteCidadeOrigem', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label className="label">UF</label>
                  <input
                    className="field"
                    value={store.freteUfOrigem ?? ''}
                    onChange={(e) =>
                      setOriginField(
                        'freteUfOrigem',
                        e.target.value.toUpperCase().slice(0, 2),
                      )
                    }
                    placeholder="SP"
                    maxLength={2}
                    required
                  />
                </div>
                {error ? (
                  <p className="text-sm text-accent sm:col-span-2">{error}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-ghost order-2 sm:order-1"
                  onClick={() => {
                    setOriginModalOpen(false);
                    setOpenSection('shipping');
                    requestAnimationFrame(() => {
                      document
                        .getElementById('origem-frete')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                >
                  Preencher na página
                </button>
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                  disabled={savingOrigin}
                >
                  {savingOrigin ? 'Salvando...' : 'Salvar endereço de origem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div>
        <h1>Configurações da loja</h1>
        <p className="text-sm text-muted">
          Abra só o que precisa ajustar ·{' '}
          <strong>/loja/{store.slug}</strong>
        </p>
      </div>

      {!originReady ? (
        <button
          type="button"
          className="w-full border border-amber-300 bg-amber-50 px-3 py-3 text-left text-sm text-amber-950"
          onClick={() => setOriginModalOpen(true)}
        >
          <p className="font-semibold">Endereço de origem pendente</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Clique para cadastrar. Sem CEP da loja o frete no checkout não
            calcula com o CEP do cliente.
          </p>
        </button>
      ) : null}

      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      {error && !originModalOpen ? (
        <p className="text-sm text-accent">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2">
      <SettingsPanel
        title="Identidade visual"
        summary="Nome, logo, cores e domínio"
        open={openSection === 'branding'}
        onToggle={() => toggleSection('branding')}
      >
      <div className="flex flex-col gap-2">
        <SettingsRow
          icon={<IconLoja />}
          title="Nome e endereço"
          value={`${store.name} · ${
            store.customDomain?.trim() || `/loja/${store.slug}`
          }`}
          onEdit={() => setIdentModal('nome')}
        />

        <SettingsRow
          icon={<IconImagem />}
          title="Logo"
          value={logo ? 'Definida' : 'Nenhuma logo ainda'}
          tone={logo ? 'ok' : 'neutro'}
          cta={logo ? 'Trocar' : 'Enviar'}
          onEdit={() => setIdentModal('logo')}
        />

        <SettingsRow
          icon={
            <span className="flex gap-1">
              <span
                className="h-3.5 w-3.5 border border-black/15"
                style={{ background: store.primaryColor }}
              />
              <span
                className="h-3.5 w-3.5 border border-black/15"
                style={{ background: store.accentColor }}
              />
            </span>
          }
          title="Cores da marca"
          value={`${store.primaryColor} · ${store.accentColor}`}
          onEdit={() => setIdentModal('cores')}
        />

        <SettingsRow
          icon={<IconVitrine />}
          title="Aparência da vitrine"
          value={identResumo.aparencia}
          onEdit={() => setIdentModal('aparencia')}
        />

        <SettingsRow
          icon={<IconRedes />}
          title="Redes sociais"
          value={identResumo.redes}
          onEdit={() => setIdentModal('redes')}
        />

        <SettingsRow
          icon={<IconGrafico />}
          title="Medição de audiência"
          value={identResumo.audiencia}
          onEdit={() => setIdentModal('audiencia')}
        />
      </div>

      {identModal ? (
        <SettingsModal
          title={IDENT_MODAL_TITULO[identModal]}
          hint={IDENT_MODAL_HINT[identModal]}
          onClose={() => setIdentModal(null)}
        >
          <form onSubmit={saveBranding} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-x-4 gap-y-4 overflow-y-auto px-4 py-4 md:grid-cols-2">
              {identModal === 'nome' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="label">Nome da loja</label>
                    <input
                      className="field"
                      value={store.name}
                      onChange={(e) => setStore({ ...store, name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Domínio próprio</label>
                    <input
                      className="field"
                      placeholder="minhaloja.com.br"
                      value={store.customDomain || ''}
                      onChange={(e) =>
                        setStore({ ...store, customDomain: e.target.value })
                      }
                    />
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Aponte o DNS (A/CNAME) para este app. Grave sem o www — o
                      sistema normaliza. Vazio, a loja continua em{' '}
                      <strong>/loja/{store.slug}</strong>.
                    </p>
                  </div>
                </>
              ) : null}

              {identModal === 'logo' ? (
                <div className="md:col-span-2">
                  <label className="label">Arquivo</label>
                  <p className="mb-1.5 text-xs leading-relaxed text-muted">
                    PNG com fundo transparente. Tamanho ideal{' '}
                    <strong>800 × 240 px</strong> (horizontal), até 5 MB.
                  </p>
                  <input
                    className="field"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        uploadLogo(f).catch((err) =>
                          setError(err instanceof Error ? err.message : 'Erro'),
                        );
                    }}
                  />
                  {logo ? (
                    <div className="mt-3 border border-line bg-[#fafafa] p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logo}
                        alt="Logo da loja"
                        className="h-14 object-contain"
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted">
                      Sem logo, a vitrine mostra o nome da loja em texto.
                    </p>
                  )}
                </div>
              ) : null}

              {identModal === 'cores' ? (
                <>
                  <div>
                    <label className="label">Cor primária</label>
                    <input
                      className="field"
                      type="color"
                      value={store.primaryColor}
                      onChange={(e) =>
                        setStore({ ...store, primaryColor: e.target.value })
                      }
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      Áreas escuras: cabeçalho, rodapé.
                    </p>
                  </div>
                  <div>
                    <label className="label">Cor de destaque</label>
                    <input
                      className="field"
                      type="color"
                      value={store.accentColor}
                      onChange={(e) =>
                        setStore({ ...store, accentColor: e.target.value })
                      }
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      Botões de comprar e preços em promoção.
                    </p>
                  </div>
                </>
              ) : null}

              {identModal === 'aparencia' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="label">Ramo da loja</label>
                    <select
                      className="field"
                      value={store.storeType || 'GENERAL'}
                      onChange={(e) =>
                        setStore({ ...store, storeType: e.target.value })
                      }
                    >
                      {Object.entries(STORE_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Define as sugestões de categoria e o estilo padrão. Os dois
                      campos abaixo em “Automático” seguem o ramo — mexa neles só
                      para fugir do preset.
                    </p>
                  </div>
                  <div>
                    <label className="label">Formato da foto do produto</label>
                    <select
                      className="field"
                      value={store.storeCardRatio || ''}
                      onChange={(e) =>
                        setStore({ ...store, storeCardRatio: e.target.value })
                      }
                    >
                      <option value="">Automático (pelo ramo)</option>
                      {STORE_CARD_RATIOS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label} — {r.hint}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Fonte da loja</label>
                    <select
                      className="field"
                      value={store.storeFont || ''}
                      onChange={(e) =>
                        setStore({ ...store, storeFont: e.target.value })
                      }
                    >
                      <option value="">Automático (pelo ramo)</option>
                      {STORE_FONTS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} — {f.hint}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <a
                      href={`/loja/${store.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-accent underline-offset-4 hover:underline"
                    >
                      Ver como está na vitrine →
                    </a>
                  </div>
                </>
              ) : null}

              {identModal === 'redes' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="label">Instagram</label>
                    <input
                      className="field"
                      placeholder="https://instagram.com/sualoja"
                      value={store.instagramUrl || ''}
                      onChange={(e) =>
                        setStore({ ...store, instagramUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Facebook</label>
                    <input
                      className="field"
                      placeholder="https://facebook.com/sualoja"
                      value={store.facebookUrl || ''}
                      onChange={(e) =>
                        setStore({ ...store, facebookUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">TikTok</label>
                    <input
                      className="field"
                      placeholder="https://tiktok.com/@sualoja"
                      value={store.tiktokUrl || ''}
                      onChange={(e) =>
                        setStore({ ...store, tiktokUrl: e.target.value })
                      }
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      Só as preenchidas aparecem no rodapé da loja.
                    </p>
                  </div>
                </>
              ) : null}

              {identModal === 'audiencia' ? (
                <>
                  <div className="md:col-span-2 border border-line bg-[#fafafa] p-3 text-xs leading-relaxed text-muted">
                    Preenchendo qualquer um dos dois, a vitrine passa a pedir
                    consentimento de cookies, como manda a LGPD — e os scripts só
                    carregam depois do aceite. Em branco, a loja usa só cookie
                    essencial e nenhum aviso aparece.
                  </div>
                  <div>
                    <label className="label">Google Analytics</label>
                    <input
                      className="field"
                      placeholder="G-XXXXXXXXXX"
                      value={store.analyticsGaId || ''}
                      onChange={(e) =>
                        setStore({ ...store, analyticsGaId: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Meta Pixel</label>
                    <input
                      className="field"
                      placeholder="123456789012345"
                      value={store.analyticsPixelId || ''}
                      onChange={(e) =>
                        setStore({ ...store, analyticsPixelId: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-ghost order-2 sm:order-1"
                onClick={() => setIdentModal(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-accent order-1 sm:order-2">
                Salvar
              </button>
            </div>
          </form>
        </SettingsModal>
      ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Carrossel da vitrine"
        summary="Banners em faixa no topo da loja"
        badge={
          <StatusPill
            ok={store.marqueeEnabled !== false && marquee.length > 0}
            okLabel={`${marquee.length} foto${marquee.length === 1 ? '' : 's'}`}
            badLabel={store.marqueeEnabled === false ? 'Off' : 'Sem fotos'}
          />
        }
        open={openSection === 'marquee'}
        onToggle={() => toggleSection('marquee')}
      >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white px-3.5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line text-muted">
              <IconCarrossel />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Exibir na vitrine</p>
              <p className="mt-0.5 text-xs text-muted">
                {marquee.length === 0
                  ? 'Sem fotos próprias, a vitrine usa imagens dos produtos.'
                  : `${marquee.length} de 12 banners`}
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={store.marqueeEnabled !== false}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setStore({ ...store, marqueeEnabled: enabled });
                try {
                  await patchBranding({
                    name: store.name,
                    logoUrl: store.logoUrl,
                    primaryColor: store.primaryColor,
                    secondaryColor: store.secondaryColor,
                    accentColor: store.accentColor,
                    customDomain: store.customDomain || undefined,
                    marqueeEnabled: enabled,
                    marqueeImages: marquee,
                  });
                  setMessage(enabled ? 'Carrossel ativado' : 'Carrossel desativado');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Erro');
                }
              }}
            />
            {store.marqueeEnabled !== false ? 'Ativo' : 'Desativado'}
          </label>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Banners grandes passando no topo — lookbook, promoção, coleção. Ideal{' '}
          <strong className="text-ink">1920 × 800 px</strong>, JPG ou PNG até 5 MB.
          De 3 a 12 fotos.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {marquee.map((path) => {
            const src = mediaUrl(path);
            return (
              <div
                key={path}
                className="group relative aspect-[21/9] overflow-hidden border border-line bg-[#eee]"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="h-full w-full object-cover" />
                ) : null}
                <button
                  type="button"
                  className="absolute right-1 top-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removeMarqueeImage(path)}
                >
                  Remover
                </button>
              </div>
            );
          })}

          {/*
            O "adicionar" é a última peça da grade, não um campo de arquivo
            solto acima dela: fica no lugar onde o banner vai aparecer, e a
            grade inteira lê como uma coisa só.
          */}
          {marquee.length < 12 ? (
            <label
              className={`flex aspect-[21/9] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-line text-xs font-semibold text-muted transition hover:border-ink/30 hover:bg-[#fafafa] ${
                uploadingMarquee ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <IconMais />
              {uploadingMarquee ? 'Enviando...' : 'Adicionar foto'}
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploadingMarquee}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) uploadMarquee(f).catch(() => undefined);
                }}
              />
            </label>
          ) : null}
        </div>
      </div>
      </SettingsPanel>

      <SettingsPanel
        id="origem-frete"
        title="Frete e endereço de origem"
        summary="CEP da loja + cotação no checkout do cliente"
        badge={
          <StatusPill
            ok={originReady}
            okLabel="Origem ok"
            badLabel="Falta endereço"
          />
        }
        open={openSection === 'shipping'}
        onToggle={() => toggleSection('shipping')}
      >
        {freteViaTransportadora ? (
          <div className="mb-3 border border-line">
            <div className="border-b border-line px-3.5 py-2.5">
              <p className="text-[13px] font-bold text-ink">
                {etiquetaPendencias.length === 0
                  ? 'Pronto para emitir etiqueta'
                  : `Falta ${etiquetaPendencias.length} item para emitir etiqueta`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {etiquetaPendencias.length === 0
                  ? 'Confira só o saldo da sua conta no Melhor Envio — a etiqueta é comprada com ele.'
                  : 'Sem estes dados o botão “Gerar etiqueta” recusa o pedido.'}
              </p>
            </div>

            <ul>
              {ETIQUETA_REQUISITOS.map((req) => {
                const ok = req.pronto(store, originReady);
                return (
                  <li key={req.id} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-[#fafafa] disabled:cursor-default disabled:hover:bg-transparent"
                      disabled={ok}
                      onClick={() => req.resolver(setFreteModal, irParaDocumento)}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold ${
                          ok
                            ? 'border-[var(--ok)] text-[var(--ok)]'
                            : 'border-accent text-accent'
                        }`}
                        aria-hidden
                      >
                        {ok ? '✓' : '!'}
                      </span>
                      <span
                        className={`flex-1 text-[13px] ${
                          ok ? 'text-muted line-through' : 'font-semibold text-ink'
                        }`}
                      >
                        {req.rotulo}
                      </span>
                      {ok ? null : (
                        <span className="shrink-0 text-xs font-semibold text-accent">
                          Resolver
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/*
              Saldo não dá para verificar daqui — só o Melhor Envio sabe, e a
              consulta gastaria uma chamada a cada abertura da tela. Fica como
              aviso, porque é a causa nº 1 de "configurei tudo e não emite".
            */}
            <p className="border-t border-line bg-[#fafafa] px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
              Conectar a conta não coloca dinheiro nela. Cada etiqueta é
              comprada com o <strong className="text-ink">saldo da sua conta
              no Melhor Envio</strong> — sem saldo, a emissão falha mesmo com
              tudo acima resolvido.
            </p>
          </div>
        ) : null}
      <div className="flex flex-col gap-2">
        <SettingsRow
          icon={<IconCalculo />}
          title="Como calcular o frete"
          value={freteResumo.calculo}
          onEdit={() => setFreteModal('calculo')}
        />

        <SettingsRow
          icon={<IconOrigem />}
          title="Endereço de origem"
          value={freteResumo.origem}
          tone={originReady ? 'ok' : 'pendente'}
          cta={originReady ? 'Ajustar' : 'Cadastrar'}
          onEdit={() => setFreteModal('origem')}
        />

        {freteViaTransportadora ? (
          <>
            <SettingsRow
              icon={<IconPacote />}
              title={
                store.freteModo === 'melhor_envio'
                  ? 'Melhor Envio'
                  : 'Conta da transportadora'
              }
              value={freteResumo.conexao}
              tone={freteConectado ? 'ok' : 'pendente'}
              cta={freteConectado ? 'Gerenciar' : 'Conectar'}
              onEdit={() => setFreteModal('conexao')}
            />

            <SettingsRow
              icon={<IconEtiqueta />}
              title="Etiqueta e transportadoras"
              value={freteResumo.etiqueta}
              onEdit={() => setFreteModal('etiqueta')}
            />
          </>
        ) : null}
      </div>

      {freteModal ? (
        <SettingsModal
          title={FRETE_MODAL_TITULO[freteModal]}
          hint={FRETE_MODAL_HINT[freteModal]}
          onClose={() => setFreteModal(null)}
        >
          <form
            onSubmit={(e) => {
              void saveShipping(e);
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="grid min-h-0 flex-1 gap-x-4 gap-y-4 overflow-y-auto px-4 py-4 md:grid-cols-2">
              {freteModal === 'calculo' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="label">Provedor de frete</label>
                    <select
                      className="field"
                      value={store.freteModo || 'manual'}
                      onChange={(e) =>
                        setStore({ ...store, freteModo: e.target.value })
                      }
                    >
                      <option value="manual">Tabela própria (valor fixo)</option>
                      <option value="gratis">Sempre grátis</option>
                      <option value="melhor_envio">
                        Melhor Envio (cotação real)
                      </option>
                      {/*
                        Frenet e SuperFrete continuam existindo na API, mas
                        saíram daqui: ninguém usa, e oferecer integração sem
                        suporte só gera lojista travado. Uma loja que já esteja
                        num deles segue funcionando e aparece abaixo.
                      */}
                      {store.freteModo === 'frenet' ? (
                        <option value="frenet">Frenet</option>
                      ) : null}
                      {store.freteModo === 'superfrete' ? (
                        <option value="superfrete">SuperFrete</option>
                      ) : null}
                    </select>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      No Melhor Envio o preço vem da cotação real, por peso e
                      dimensão de cada produto. Nas outras duas quem define o
                      valor é você.
                    </p>
                  </div>

                  {store.freteModo === 'manual' ? (
                    <div>
                      <label className="label">Valor base PAC (R$)</label>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        value={store.freteValorFixo ?? '25'}
                        onChange={(e) =>
                          setStore({ ...store, freteValorFixo: e.target.value })
                        }
                      />
                    </div>
                  ) : null}

                  {store.freteModo !== 'gratis' ? (
                    <div
                      className={store.freteModo === 'manual' ? '' : 'md:col-span-2'}
                    >
                      <label className="label">Frete grátis acima de (R$)</label>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        min="0"
                        value={store.freteGratisAcima ?? ''}
                        onChange={(e) =>
                          setStore({ ...store, freteGratisAcima: e.target.value })
                        }
                        placeholder="Opcional — vazio, sempre cobra"
                      />
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {freteViaTransportadora
                          ? 'O checkout continua cotando as transportadoras e zera o preço quando o carrinho passa desse valor.'
                          : 'Vazio ou 0 desliga a regra.'}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {freteModal === 'origem' ? (
                <>
                  <div>
                    <label className="label">CEP de origem</label>
                    <input
                      className="field"
                      value={store.freteCepOrigem ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const digits = raw.replace(/\D/g, '').slice(0, 8);
                        setStore({ ...store, freteCepOrigem: raw });
                        void lookupOriginCep(digits);
                      }}
                      placeholder="00000-000"
                      inputMode="numeric"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Número</label>
                    <input
                      className="field"
                      value={store.freteNumeroOrigem ?? ''}
                      onChange={(e) =>
                        setStore({ ...store, freteNumeroOrigem: e.target.value })
                      }
                      placeholder="123"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Rua / logradouro</label>
                    <input
                      className="field"
                      value={store.freteRuaOrigem ?? ''}
                      onChange={(e) =>
                        setStore({ ...store, freteRuaOrigem: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Complemento</label>
                    <input
                      className="field"
                      value={store.freteComplementoOrigem ?? ''}
                      onChange={(e) =>
                        setStore({
                          ...store,
                          freteComplementoOrigem: e.target.value,
                        })
                      }
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <label className="label">Bairro</label>
                    <input
                      className="field"
                      value={store.freteBairroOrigem ?? ''}
                      onChange={(e) =>
                        setStore({ ...store, freteBairroOrigem: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Cidade</label>
                    <input
                      className="field"
                      value={store.freteCidadeOrigem ?? ''}
                      onChange={(e) =>
                        setStore({ ...store, freteCidadeOrigem: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">UF</label>
                    <input
                      className="field"
                      value={store.freteUfOrigem ?? ''}
                      onChange={(e) =>
                        setStore({
                          ...store,
                          freteUfOrigem: e.target.value.toUpperCase().slice(0, 2),
                        })
                      }
                      placeholder="SP"
                      maxLength={2}
                      required
                    />
                  </div>
                </>
              ) : null}

              {freteModal === 'conexao' ? (
                <>
                  {store.freteModo === 'melhor_envio' ? (
                    <div className="md:col-span-2 border border-line bg-[#f7f9fb] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-white text-[#0B1F33]">
                            <IconPacote />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-ink">
                              Melhor Envio
                            </p>
                            {freteConectado ? (
                              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                                Conectado como{' '}
                                <strong className="text-[var(--ok)]">
                                  {store.freteContaNome || 'conta autorizada'}
                                </strong>
                                {store.freteContaEmail
                                  ? ` · ${store.freteContaEmail}`
                                  : ''}
                                . O acesso se renova sozinho.
                              </p>
                            ) : (
                              <p className="mt-0.5 max-w-[52ch] text-[13px] leading-relaxed text-muted">
                                Entre na sua conta e autorize — sem copiar
                                token. O acesso passa a se renovar sozinho; o
                                token colado na mão vence em 30 dias e o frete
                                para de cotar sem aviso.
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={freteConectado ? 'btn btn-ghost' : 'btn btn-accent'}
                          onClick={
                            freteConectado
                              ? desconectarMelhorEnvio
                              : conectarMelhorEnvio
                          }
                          disabled={meBusy}
                        >
                          {meBusy
                            ? 'Aguarde...'
                            : freteConectado
                              ? 'Desconectar'
                              : 'Conectar conta'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="md:col-span-2">
                    <label className="label">
                      Token da API
                      {store.freteTokenSet ? (
                        <span className="ml-1 font-normal text-[var(--ok)]">
                          (já configurado)
                        </span>
                      ) : null}
                    </label>
                    <input
                      className="field"
                      type="password"
                      value={freteToken}
                      onChange={(e) => setFreteToken(e.target.value)}
                      placeholder={
                        store.freteTokenSet
                          ? 'Deixe em branco para manter'
                          : 'Cole o token'
                      }
                      required={!store.freteTokenSet && !freteConectado}
                    />
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      Alternativa à conexão acima, para quem prefere colar o
                      token na mão. Conectando a conta, este campo não é
                      necessário.
                    </p>
                  </div>

                  {store.freteModo === 'melhor_envio' ? (
                    <>
                      <div>
                        <label className="label">Ambiente Melhor Envio</label>
                        <select
                          className="field"
                          value={store.freteSandbox === true ? 'sandbox' : 'prod'}
                          onChange={(e) =>
                            setStore({
                              ...store,
                              freteSandbox: e.target.value === 'sandbox',
                            })
                          }
                        >
                          <option value="prod">Produção</option>
                          <option value="sandbox">Sandbox</option>
                        </select>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Sandbox só para teste — não gera etiqueta válida.
                        </p>
                      </div>
                      <div>
                        <label className="label">E-mail de contato</label>
                        <input
                          className="field"
                          type="email"
                          value={store.freteEmailContato ?? ''}
                          onChange={(e) =>
                            setStore({
                              ...store,
                              freteEmailContato: e.target.value,
                            })
                          }
                          required
                        />
                        <p className="mt-0.5 text-[11px] text-muted">
                          Exigido pelo Melhor Envio em toda cotação.
                        </p>
                      </div>

                      <div className="md:col-span-2 border-t border-line pt-4">
                        <button
                          type="button"
                          className="text-xs font-semibold text-muted underline-offset-4 hover:underline"
                          onClick={() => setMeHelpOpen((v) => !v)}
                        >
                          {meHelpOpen
                            ? 'Fechar o passo a passo'
                            : 'Prefere colar o token na mão? Ver o passo a passo'}
                        </button>

                        {meHelpOpen ? (
                          <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted">
                            <li>
                              Entre em{' '}
                              <a
                                href="https://melhorenvio.com.br"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-ink underline"
                              >
                                melhorenvio.com.br
                              </a>{' '}
                              e vá em <strong>Integrações → Área Dev.</strong>
                            </li>
                            <li>
                              Gere um token e marque só as permissões de
                              cotação, carrinho, etiqueta e rastreio.
                            </li>
                            <li>
                              Cole no campo acima e informe o e-mail de contato.
                            </li>
                            <li>
                              Lembre que esse token vence em 30 dias. Conectando
                              a conta, a renovação é automática.
                            </li>
                          </ol>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}

              {freteModal === 'etiqueta' ? (
                <>
                  <div className="md:col-span-2 border border-line p-3">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={store.freteEtiquetaAuto === true}
                        onChange={(e) =>
                          setStore({
                            ...store,
                            freteEtiquetaAuto: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <span className="text-sm font-bold">
                          Gerar etiqueta automaticamente
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                          Assim que o pagamento é aprovado, a etiqueta é
                          comprada e emitida, e o rastreio entra sozinho no
                          pedido.{' '}
                          <strong>Isso gasta o saldo da sua conta.</strong>{' '}
                          Desligado, você emite pelo botão em cada pedido.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-sm font-bold text-ink">
                      Transportadoras no checkout
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      Marque só as que o cliente pode escolher. Nenhuma marcada
                      = mostra todas que a cotação devolver.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {FRETE_CARRIER_OPTIONS.map((c) => {
                        const selected = asCarrierIds(store.freteTransportadoras);
                        const checked = selected.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 border border-line px-2.5 py-2 text-sm hover:bg-[#fafafa]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setStore({
                                  ...store,
                                  freteTransportadoras: checked
                                    ? selected.filter((id) => id !== c.id)
                                    : [...selected, c.id],
                                })
                              }
                            />
                            <span>{c.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost py-1 text-xs"
                        onClick={() =>
                          setStore({
                            ...store,
                            freteTransportadoras: FRETE_CARRIER_OPTIONS.map(
                              (c) => c.id,
                            ),
                          })
                        }
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost py-1 text-xs"
                        onClick={() =>
                          setStore({ ...store, freteTransportadoras: [] })
                        }
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost py-1 text-xs"
                        onClick={() =>
                          setStore({
                            ...store,
                            freteTransportadoras: ['correios'],
                          })
                        }
                      >
                        Só Correios
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-ghost order-2 sm:order-1"
                onClick={() => setFreteModal(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-accent order-1 sm:order-2"
              >
                Salvar
              </button>
            </div>
          </form>
        </SettingsModal>
      ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Pagamento (Mercado Pago)"
        summary="Como o cliente paga o pedido na loja"
        badge={
          <StatusPill
            ok={Boolean(store.mpAccessTokenSet && store.mpPublicKey)}
            okLabel="Configurado"
            badLabel="Pendente"
          />
        }
        open={openSection === 'payments'}
        onToggle={() => toggleSection('payments')}
      >
      <div className="flex flex-col gap-2">
        <SettingsRow
          icon={<IconCartao />}
          title="Credenciais do Mercado Pago"
          value={
            store.mpAccessTokenSet && store.mpPublicKey
              ? `Configurado · ${store.mpAccessTokenHint || 'token salvo'}`
              : 'Pendente — sem isso o checkout não abre'
          }
          tone={store.mpAccessTokenSet && store.mpPublicKey ? 'ok' : 'pendente'}
          cta={store.mpAccessTokenSet ? 'Gerenciar' : 'Configurar'}
          onEdit={() => setPagamentoModal('credenciais')}
        />

        <SettingsRow
          icon={<IconCheckout />}
          title="Modelo de checkout"
          value={
            store.checkoutMode === 'pro'
              ? 'Checkout Pro · cliente vai para o site do Mercado Pago'
              : 'Brick na loja · cliente paga sem sair da vitrine'
          }
          onEdit={() => setPagamentoModal('modelo')}
        />

        {store.mpWebhookUrl ? (
          <SettingsRow
            icon={<IconWebhook />}
            title="Webhook de pagamento"
            value={store.mpWebhookUrl}
            cta="Ver URL"
            onEdit={() => setPagamentoModal('webhook')}
          />
        ) : null}
      </div>

      {pagamentoModal ? (
        <SettingsModal
          title={PAGAMENTO_MODAL_TITULO[pagamentoModal]}
          hint={PAGAMENTO_MODAL_HINT[pagamentoModal]}
          onClose={() => setPagamentoModal(null)}
        >
          <form onSubmit={saveMp} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-x-4 gap-y-4 overflow-y-auto px-4 py-4">
              {pagamentoModal === 'modelo' ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`cursor-pointer border px-3 py-3 text-sm ${
                      (store.checkoutMode || 'personalized') !== 'pro'
                        ? 'border-accent bg-[#fff8f9]'
                        : 'border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      name="checkoutMode"
                      checked={(store.checkoutMode || 'personalized') !== 'pro'}
                      onChange={() =>
                        setStore({ ...store, checkoutMode: 'personalized' })
                      }
                    />
                    <span className="font-semibold">Brick na loja</span>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Cartão e Pix na própria loja. O cliente não sai da sua
                      vitrine — costuma converter melhor.
                    </p>
                  </label>
                  <label
                    className={`cursor-pointer border px-3 py-3 text-sm ${
                      store.checkoutMode === 'pro'
                        ? 'border-accent bg-[#fff8f9]'
                        : 'border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      name="checkoutMode"
                      checked={store.checkoutMode === 'pro'}
                      onChange={() => setStore({ ...store, checkoutMode: 'pro' })}
                    />
                    <span className="font-semibold">Checkout Pro</span>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Redireciona para a página do Mercado Pago e volta depois
                      do pagamento.
                    </p>
                  </label>
                </div>
              ) : null}

              {pagamentoModal === 'credenciais' ? (
                <>
                  {!store.mpAccessTokenSet || !store.mpPublicKey ? (
                    <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      O pagamento fica desligado até Access Token e Public Key
                      estarem salvos.
                    </p>
                  ) : null}

                  <div>
                    <label className="label">
                      Access Token
                      {store.mpAccessTokenSet ? (
                        <span className="ml-1 font-normal text-[var(--ok)]">
                          (salvo no servidor)
                        </span>
                      ) : null}
                    </label>
                    {store.mpAccessTokenSet && store.mpAccessTokenHint ? (
                      <p className="mb-1.5 border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                        Token atual: <code>{store.mpAccessTokenHint}</code> — o
                        campo abaixo fica vazio de propósito. Só cole de novo se
                        for trocar.
                      </p>
                    ) : null}
                    <input
                      className="field"
                      type="password"
                      value={mpAccessToken}
                      onChange={(e) => setMpAccessToken(e.target.value)}
                      placeholder={
                        store.mpAccessTokenSet
                          ? 'Cole um novo só se quiser substituir'
                          : 'Cole o Access Token (teste ou produção)'
                      }
                      required={!store.mpAccessTokenSet}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="label">Public Key</label>
                    {store.mpPublicKeyHint ? (
                      <p className="mb-1 text-[11px] text-muted">
                        Salva: <code>{store.mpPublicKeyHint}</code>
                      </p>
                    ) : null}
                    <input
                      className="field"
                      value={mpPublicKey}
                      onChange={(e) => setMpPublicKey(e.target.value)}
                      placeholder="Cole a Public Key (mesmo bloco do token)"
                      required={!store.mpPublicKey && !mpPublicKey}
                      autoComplete="off"
                    />
                  </div>

                  <div className="border border-line bg-[#fafafa] p-3 text-[11px] leading-relaxed text-muted">
                    <p className="font-bold text-ink">
                      Public Key não é o Access Token
                    </p>
                    <p className="mt-1">
                      As duas saem do mesmo bloco. Para testar, entre na conta{' '}
                      <strong className="text-ink">real do vendedor</strong>{' '}
                      (e-mail/CPF normal, <strong>nunca</strong> no TESTUSER) →
                      Developers → Suas integrações → app →{' '}
                      <strong className="text-ink">Credenciais de teste</strong>.
                      Token de TESTUSER é rejeitado no teste abaixo.
                    </p>
                  </div>

                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void testMp()}
                      disabled={!store.mpAccessTokenSet}
                    >
                      Testar credenciais no Mercado Pago
                    </button>
                  </div>
                </>
              ) : null}

              {pagamentoModal === 'webhook' ? (
                <div>
                  <p className="text-xs leading-relaxed text-muted">
                    O Mercado Pago avisa esta URL quando o cliente paga por Pix
                    ou cartão, e quando um pagamento é reembolsado. É ela que faz
                    o pedido mudar de status sozinho.
                  </p>
                  <code className="mt-3 block break-all border border-line bg-[#fafafa] px-2 py-2 text-[11px]">
                    {store.mpWebhookUrl}
                  </code>
                  <button
                    type="button"
                    className="btn btn-ghost mt-2 text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(store.mpWebhookUrl || '');
                      setMessage('URL do webhook copiada');
                    }}
                  >
                    Copiar URL
                  </button>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    Em produção o <code>PUBLIC_URL</code> do <code>.env</code> da
                    API precisa ser um HTTPS público — localhost não recebe
                    notificação.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-ghost order-2 sm:order-1"
                onClick={() => setPagamentoModal(null)}
              >
                {pagamentoModal === 'webhook' ? 'Fechar' : 'Cancelar'}
              </button>
              {pagamentoModal === 'webhook' ? null : (
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                >
                  Salvar
                </button>
              )}
            </div>
          </form>
        </SettingsModal>
      ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Perfil da loja / documento"
        summary="CPF/CNPJ e endereço do emitente"
        badge={
          <StatusPill
            ok={Boolean(store.sellerDocument && store.sellerDocType)}
            okLabel="Documento ok"
            badLabel="Documento pendente"
          />
        }
        open={openSection === 'profile'}
        onToggle={() => toggleSection('profile')}
      >
        <div className="flex flex-col gap-2">
          <SettingsRow
            icon={<IconIdentidade />}
            title="Quem emite a venda"
            value={perfilResumo.documento}
            tone={store.sellerDocument && store.sellerDocType ? 'ok' : 'pendente'}
            cta={store.sellerDocument ? 'Ajustar' : 'Preencher'}
            onEdit={() => setPerfilModal('documento')}
          />

          <SettingsRow
            icon={<IconContato />}
            title="Contato"
            value={perfilResumo.contato}
            onEdit={() => setPerfilModal('contato')}
          />

          <SettingsRow
            icon={<IconOrigem />}
            title="Endereço do emitente"
            value={perfilResumo.endereco}
            tone={store.sellerZipCode ? 'ok' : 'neutro'}
            onEdit={() => setPerfilModal('endereco')}
          />
        </div>

        {perfilModal ? (
          <SettingsModal
            title={PERFIL_MODAL_TITULO[perfilModal]}
            hint={PERFIL_MODAL_HINT[perfilModal]}
            onClose={() => setPerfilModal(null)}
          >
            <form onSubmit={saveProfile} className="flex min-h-0 flex-1 flex-col">
              <div className="grid min-h-0 flex-1 gap-x-4 gap-y-4 overflow-y-auto px-4 py-4 md:grid-cols-2">
                {perfilModal === 'documento' ? (
                  <>
                    <div>
                      <label className="label">Tipo de documento</label>
                      <select
                        className="field"
                        value={store.sellerDocType || ''}
                        onChange={(e) =>
                          setStore({
                            ...store,
                            sellerDocType: (e.target.value || null) as
                              | 'CPF'
                              | 'CNPJ'
                              | null,
                          })
                        }
                      >
                        <option value="">Selecione...</option>
                        <option value="CPF">CPF — pessoa física</option>
                        <option value="CNPJ">CNPJ — empresa</option>
                      </select>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        Loja pequena pode operar como pessoa física. Não precisa
                        ser CNPJ.
                      </p>
                    </div>
                    <div>
                      <label className="label">
                        {store.sellerDocType === 'CNPJ' ? 'CNPJ' : 'CPF'}
                      </label>
                      <input
                        className="field"
                        value={store.sellerDocument || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerDocument: e.target.value })
                        }
                        placeholder={
                          store.sellerDocType === 'CNPJ'
                            ? '00.000.000/0000-00'
                            : '000.000.000-00'
                        }
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="label">Razão social / nome completo</label>
                      <input
                        className="field"
                        value={store.sellerLegalName || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerLegalName: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Nome fantasia (opcional)</label>
                      <input
                        className="field"
                        value={store.sellerTradeName || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerTradeName: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">IE — inscrição estadual</label>
                      <input
                        className="field"
                        value={store.sellerIe || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerIe: e.target.value })
                        }
                        placeholder="Opcional · ou ISENTO"
                      />
                    </div>
                  </>
                ) : null}

                {perfilModal === 'contato' ? (
                  <>
                    <div>
                      <label className="label">WhatsApp da loja / responsável</label>
                      <input
                        className="field"
                        value={store.sellerPhone || ''}
                        onChange={(e) =>
                          setStore({
                            ...store,
                            sellerPhone: formatPhoneBr(e.target.value),
                          })
                        }
                        placeholder="(11) 99999-9999"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={15}
                      />
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        Usado no botão “Conversar com vendedor” na vitrine e na
                        NFC-e.
                      </p>
                    </div>
                    <div>
                      <label className="label">E-mail fiscal</label>
                      <input
                        className="field"
                        type="email"
                        value={store.sellerEmail || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerEmail: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : null}

                {perfilModal === 'endereco' ? (
                  <>
                    <div>
                      <label className="label">CEP</label>
                      <input
                        className="field"
                        value={store.sellerZipCode || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerZipCode: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">UF</label>
                      <input
                        className="field"
                        maxLength={2}
                        value={store.sellerState || ''}
                        onChange={(e) =>
                          setStore({
                            ...store,
                            sellerState: e.target.value.toUpperCase().slice(0, 2),
                          })
                        }
                        placeholder="SP"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Rua</label>
                      <input
                        className="field"
                        value={store.sellerStreet || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerStreet: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Número</label>
                      <input
                        className="field"
                        value={store.sellerNumber || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerNumber: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Bairro</label>
                      <input
                        className="field"
                        value={store.sellerNeighborhood || ''}
                        onChange={(e) =>
                          setStore({
                            ...store,
                            sellerNeighborhood: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Cidade</label>
                      <input
                        className="field"
                        value={store.sellerCity || ''}
                        onChange={(e) =>
                          setStore({ ...store, sellerCity: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-ghost order-2 sm:order-1"
                  onClick={() => setPerfilModal(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                >
                  Salvar
                </button>
              </div>
            </form>
          </SettingsModal>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Políticas"
        summary="Termos, privacidade e trocas (páginas públicas da loja)"
        open={openSection === 'policies'}
        onToggle={() => toggleSection('policies')}
      >
        <div className="flex flex-col gap-2">
          {POLITICAS.map((pol) => (
            <SettingsRow
              key={pol.campo}
              icon={<IconDocumento />}
              title={pol.titulo}
              value={
                (store[pol.campo] || '').trim()
                  ? `Texto próprio · ${
                      (store[pol.campo] || '').replace(/<[^>]*>/g, '').trim()
                        .length
                    } caracteres`
                  : 'Usando o texto padrão da plataforma'
              }
              tone={(store[pol.campo] || '').trim() ? 'ok' : 'neutro'}
              cta={(store[pol.campo] || '').trim() ? 'Editar' : 'Escrever'}
              onEdit={() => setPoliticaModal(pol.campo)}
            />
          ))}
        </div>

        {politicaModal ? (
          <SettingsModal
            title={
              POLITICAS.find((p) => p.campo === politicaModal)?.titulo ||
              'Política'
            }
            hint={POLITICAS.find((p) => p.campo === politicaModal)?.hint}
            onClose={() => setPoliticaModal(null)}
          >
            <form onSubmit={savePolicies} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <textarea
                  className="field min-h-[320px] w-full resize-y font-mono text-xs leading-relaxed"
                  value={store[politicaModal] || ''}
                  onChange={(e) =>
                    setStore({ ...store, [politicaModal]: e.target.value })
                  }
                  placeholder={
                    POLITICAS.find((p) => p.campo === politicaModal)?.exemplo
                  }
                />
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Aceita HTML simples (parágrafos, listas, negrito). Deixando em
                  branco, a loja mostra o texto padrão da plataforma.{' '}
                  <a
                    href={`/loja/${store.slug}/politicas/${
                      POLITICAS.find((p) => p.campo === politicaModal)?.rota
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    Ver a página pública →
                  </a>
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-ghost order-2 sm:order-1"
                  onClick={() => setPoliticaModal(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                >
                  Salvar
                </button>
              </div>
            </form>
          </SettingsModal>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Nota fiscal (NFC-e)"
        summary="Emissão automática via Focus NFe"
        badge={
          <StatusPill
            ok={!!store.nfeEnabled && !!store.nfeApiTokenSet}
            okLabel={store.nfeEnabled ? 'NFC-e ativa' : 'Desligada'}
            badLabel="Não configurada"
          />
        }
        open={openSection === 'nfe'}
        onToggle={() => toggleSection('nfe')}
      >
        <div className="flex flex-col gap-2">
          <SettingsRow
            icon={<IconNota />}
            title="Emissão"
            value={
              store.nfeEnabled
                ? `Ligada · ambiente ${
                    store.nfeEnvironment === 'producao'
                      ? 'produção'
                      : 'homologação'
                  }`
                : 'Desligada — nenhum pedido gera nota'
            }
            tone={
              store.nfeEnabled && store.nfeEnvironment === 'producao'
                ? 'ok'
                : 'neutro'
            }
            onEdit={() => setNfeModal('emissao')}
          />

          <SettingsRow
            icon={<IconChave />}
            title="Credenciais da Focus NFe"
            value={
              store.nfeApiTokenSet
                ? 'Token salvo no servidor'
                : 'Pendente — sem token a nota não sai'
            }
            tone={store.nfeApiTokenSet ? 'ok' : 'pendente'}
            cta={store.nfeApiTokenSet ? 'Gerenciar' : 'Configurar'}
            onEdit={() => setNfeModal('credenciais')}
          />
        </div>

        {nfeModal ? (
          <SettingsModal
            title={
              nfeModal === 'emissao'
                ? 'Emissão de NFC-e'
                : 'Credenciais da Focus NFe'
            }
            hint={
              nfeModal === 'emissao'
                ? 'Quando a nota é emitida e em qual ambiente. Homologação não vale como documento fiscal.'
                : 'Tokens da sua conta na Focus. Ficam cifrados e nunca voltam para a tela depois de salvos.'
            }
            onClose={() => setNfeModal(null)}
          >
            <form onSubmit={saveNfe} className="flex min-h-0 flex-1 flex-col">
              <div className="grid min-h-0 flex-1 gap-x-4 gap-y-4 overflow-y-auto px-4 py-4 md:grid-cols-2">
                {nfeModal === 'emissao' ? (
                  <>
                    <div className="md:col-span-2 border border-line p-3">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!store.nfeEnabled}
                          onChange={(e) =>
                            setStore({ ...store, nfeEnabled: e.target.checked })
                          }
                        />
                        <span>
                          <span className="text-sm font-bold">
                            Emitir NFC-e nos pedidos pagos
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                            A nota sai sozinha assim que o pagamento é aprovado.
                          </span>
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="label">Ambiente</label>
                      <select
                        className="field"
                        value={store.nfeEnvironment || 'homologacao'}
                        onChange={(e) =>
                          setStore({ ...store, nfeEnvironment: e.target.value })
                        }
                      >
                        <option value="homologacao">Homologação</option>
                        <option value="producao">Produção</option>
                      </select>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        Homologação é teste — a nota não tem valor fiscal. Vire
                        para produção só depois de validar.
                      </p>
                    </div>
                    <div>
                      <label className="label">Série</label>
                      <input
                        className="field"
                        value={store.nfeSeries || ''}
                        onChange={(e) =>
                          setStore({ ...store, nfeSeries: e.target.value })
                        }
                        placeholder="1"
                      />
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        Precisa bater com a série cadastrada na SEFAZ.
                      </p>
                    </div>
                  </>
                ) : null}

                {nfeModal === 'credenciais' ? (
                  <>
                    <div className="md:col-span-2">
                      <label className="label">Token API</label>
                      <input
                        className="field"
                        type="password"
                        value={nfeApiToken}
                        onChange={(e) => setNfeApiToken(e.target.value)}
                        placeholder={
                          store.nfeApiTokenSet
                            ? 'Já configurado · deixe em branco para manter'
                            : 'Cole o token da Focus NFe'
                        }
                        autoComplete="new-password"
                      />
                      {store.nfeApiTokenSet ? (
                        <p className="mt-0.5 text-[11px] text-[var(--ok)]">
                          Token já salvo na loja.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="label">CSC ID (opcional)</label>
                      <input
                        className="field"
                        value={store.nfeCscId || ''}
                        onChange={(e) =>
                          setStore({ ...store, nfeCscId: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">CSC Token (opcional)</label>
                      <input
                        className="field"
                        type="password"
                        value={nfeCscToken}
                        onChange={(e) => setNfeCscToken(e.target.value)}
                        placeholder={
                          store.nfeCscTokenSet
                            ? 'Já configurado · em branco para manter'
                            : undefined
                        }
                        autoComplete="new-password"
                      />
                    </div>
                    <p className="md:col-span-2 text-[11px] leading-relaxed text-muted">
                      O CSC só é exigido por parte dos estados. Se a Focus não
                      pediu, pode deixar vazio.
                    </p>
                  </>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-[#fafafa] px-4 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-ghost order-2 sm:order-1"
                  onClick={() => setNfeModal(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-accent order-1 sm:order-2"
                >
                  Salvar
                </button>
              </div>
            </form>
          </SettingsModal>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Seu plano na plataforma"
        summary="Mensalidade que você paga pelo sistema"
        open={openSection === 'plan'}
        onToggle={() => toggleSection('plan')}
      >
      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
        <p className="text-xs text-muted md:col-span-2">
          Isso é o que <strong>você, dono da loja</strong>, paga — não é o
          pagamento dos seus clientes.
        </p>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">Plano</p>
          <p className="mt-1 font-semibold">{store.planName || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">Status</p>
          <p className="mt-1 font-semibold">
            {store.status === 'ACTIVE'
              ? 'Ativa'
              : store.status === 'TRIAL'
                ? 'Trial'
                : store.status === 'PAST_DUE'
                  ? 'Em atraso'
                  : store.status === 'SUSPENDED'
                    ? 'Suspensa'
                    : store.status || '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">
            Mensalidade
          </p>
          <p className="mt-1 text-lg font-bold">
            {store.monthlyFee != null && store.monthlyFee !== ''
              ? `R$ ${Number(store.monthlyFee).toFixed(2).replace('.', ',')}`
              : 'A definir'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-muted">
            Próximo vencimento
          </p>
          <p className="mt-1 font-semibold">
            {store.planDueAt
              ? new Date(store.planDueAt).toLocaleDateString('pt-BR')
              : '—'}
            {store.daysLeft != null ? (
              <span className="ml-2 text-xs font-normal text-muted">
                ({store.daysLeft < 0
                  ? 'vencido'
                  : `${store.daysLeft} dia${store.daysLeft === 1 ? '' : 's'}`})
              </span>
            ) : null}
          </p>
        </div>
        <div className="md:col-span-2">
          <Link href="/admin/settings/planos" className="btn inline-flex">
            Ver planos e pagar mensalidade
          </Link>
        </div>
      </div>
      </SettingsPanel>
      </div>
    </div>
  );
}
