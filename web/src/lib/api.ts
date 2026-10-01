/** Preferir `/api` (rewrite no Next → Nest). Evita bater no Next sem proxy. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'STORE_ADMIN' | 'CUSTOMER';
  storeId: string | null;
  /** Painel da loja: false = funcionário convidado pelo dono. */
  dono?: boolean;
  /** Áreas liberadas ao funcionário (null para o dono). */
  permissoes?: string[] | null;
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

/**
 * Miniatura (480px) da foto, para vitrine, carrinho e listas.
 *
 * Todo upload novo vira `abc.webp` + `abc-thumb.webp` (ver
 * api/src/uploads/image-optimizer.ts). Foto antiga (.jpg/.png) ou URL externa
 * não tem miniatura, então volta a própria foto.
 */
export function thumbUrl(path?: string | null) {
  if (!path || path.startsWith('http') || !path.endsWith('.webp')) {
    return mediaUrl(path);
  }
  if (path.endsWith('-thumb.webp')) return mediaUrl(path);
  return mediaUrl(path.replace(/\.webp$/, '-thumb.webp'));
}
