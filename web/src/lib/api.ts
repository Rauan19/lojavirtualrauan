/** Preferir `/api` (rewrite no Next → Nest). Evita bater no Next sem proxy. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'STORE_ADMIN' | 'CUSTOMER';
  storeId: string | null;
  store?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  storeSlug?: string | null;
  formData?: FormData;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.storeSlug) {
    headers['X-Store-Slug'] = options.storeSlug;
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    let message = 'Erro na requisição';
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (data.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export function money(value: number | string) {
  const n = typeof value === 'string' ? Number(value) : value;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = process.env.NEXT_PUBLIC_UPLOADS_URL || '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
