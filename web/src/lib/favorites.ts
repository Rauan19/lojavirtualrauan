import { api } from '@/lib/api';

const cache = new Map<string, Promise<Set<string>>>();

/** Uma chamada só por loja+cliente, reaproveitada por todos os botões da página. */
export function fetchFavoritesOnce(storeSlug: string, customerId: string, token: string) {
  const key = `${storeSlug}:${customerId}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = api<string[]>('/storefront/favorites', { storeSlug, token })
      .then((ids) => new Set(ids))
      .catch(() => new Set<string>());
    cache.set(key, promise);
  }
  return promise;
}

export function invalidateFavoritesCache(storeSlug: string, customerId: string) {
  cache.delete(`${storeSlug}:${customerId}`);
}

export function addFavoriteApi(storeSlug: string, token: string, productId: string) {
  return api(`/storefront/favorites/${productId}`, { method: 'POST', storeSlug, token });
}

export function removeFavoriteApi(storeSlug: string, token: string, productId: string) {
  return api(`/storefront/favorites/${productId}`, { method: 'DELETE', storeSlug, token });
}
