import { headers } from 'next/headers';

/**
 * Busca server-side na API. O `api()` do cliente aponta para o próprio Next
 * (proxy), o que não funciona durante o build/SSR — aqui vamos direto no Nest.
 */
const API_ORIGIN = (
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_ORIGIN ||
  'http://127.0.0.1:3001'
).replace(/\/$/, '');

export type SeoStore = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  customDomain?: string | null;
  accentColor?: string | null;
  sellerTradeName?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  status?: string;
};

export type SeoProduct = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: string | number;
  stock?: number;
  brand?: string | null;
  sku?: string | null;
  updatedAt?: string;
  images?: { url: string }[];
  rating?: { avg: number; count: number } | null;
};

/** Falha de rede não pode derrubar a página — SEO é enfeite, conteúdo não. */
async function fetchJson<T>(
  path: string,
  init?: RequestInit & { storeSlug?: string },
): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.storeSlug ? { 'x-store-slug': init.storeSlug } : {}),
        ...(init?.headers || {}),
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getStore(slug: string) {
  return fetchJson<SeoStore>(`/api/stores/public/${encodeURIComponent(slug)}`);
}

export function getProducts(slug: string, limit = 200) {
  return fetchJson<{ items?: SeoProduct[] } | SeoProduct[]>(
    `/api/catalog/products?limit=${limit}`,
    { storeSlug: slug },
  );
}

export function getProduct(slug: string, idOrSlug: string) {
  return fetchJson<SeoProduct>(
    `/api/catalog/products/${encodeURIComponent(idOrSlug)}`,
    { storeSlug: slug },
  );
}

export function getPublicStores() {
  return fetchJson<{ slug: string; updatedAt: string }[]>('/api/public/stores');
}

export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  periodDays: number;
  badge?: string;
  highlight?: boolean;
  features?: string[];
};

/** Planos reais do banco (editados pelo Super Admin) — usado na landing. */
export function getPlans() {
  return fetchJson<PublicPlan[]>('/api/public/plans');
}

export function resolveHost(host: string) {
  return fetchJson<{ slug: string }>(
    `/api/public/resolve-host?host=${encodeURIComponent(host)}`,
  );
}

/** Hosts que são da plataforma, não de lojista. */
function platformHosts(): Set<string> {
  const raw = process.env.PLATFORM_HOSTS || 'localhost,127.0.0.1';
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^www\./, ''))
      .filter(Boolean),
  );
}

export async function currentHost(): Promise<string> {
  const h = await headers();
  const raw = h.get('x-forwarded-host') || h.get('host') || '';
  return raw.split(':')[0].trim().toLowerCase().replace(/^www\./, '');
}

/**
 * Descobre se a requisição chegou por domínio próprio de uma loja.
 * `null` = host da plataforma.
 */
export async function storeSlugFromHost(): Promise<string | null> {
  const host = await currentHost();
  if (!host || platformHosts().has(host)) return null;
  const resolved = await resolveHost(host);
  return resolved?.slug || null;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

/**
 * Base pública de uma loja: domínio próprio quando existe, senão o caminho
 * dentro do site da plataforma.
 */
export function storeBaseUrl(store: {
  slug: string;
  customDomain?: string | null;
}): string {
  if (store.customDomain?.trim()) {
    return `https://${store.customDomain.trim().replace(/^www\./, '')}`;
  }
  return `${siteUrl()}/loja/${store.slug}`;
}

export function absoluteMedia(
  url: string | null | undefined,
): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl()}${value.startsWith('/') ? '' : '/'}${value}`;
}

export function asProductList(
  data: { items?: SeoProduct[] } | SeoProduct[] | null,
): SeoProduct[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.items || [];
}

/** Descrição curta e limpa para meta tag. */
export function metaDescription(
  raw: string | null | undefined,
  fallback: string,
): string {
  const text = (raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
