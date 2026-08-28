export type RecentProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string | null;
};

function key(storeSlug: string) {
  return `recently_viewed:${storeSlug}`;
}

export function pushRecentlyViewed(storeSlug: string, product: RecentProduct) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(key(storeSlug));
    const list: RecentProduct[] = raw ? JSON.parse(raw) : [];
    const next = [product, ...list.filter((p) => p.id !== product.id)].slice(0, 8);
    window.localStorage.setItem(key(storeSlug), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentlyViewed(storeSlug: string, excludeId?: string): RecentProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key(storeSlug));
    const list: RecentProduct[] = raw ? JSON.parse(raw) : [];
    return list.filter((p) => p.id !== excludeId);
  } catch {
    return [];
  }
}
