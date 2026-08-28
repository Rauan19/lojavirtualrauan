function key(storeSlug: string) {
  return `wishlist:${storeSlug}`;
}

function read(storeSlug: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key(storeSlug));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(storeSlug: string, ids: string[]) {
  try {
    window.localStorage.setItem(key(storeSlug), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function isWishlisted(storeSlug: string, productId: string) {
  return read(storeSlug).includes(productId);
}

export function toggleWishlist(storeSlug: string, productId: string): boolean {
  const ids = read(storeSlug);
  const has = ids.includes(productId);
  const next = has ? ids.filter((id) => id !== productId) : [productId, ...ids];
  write(storeSlug, next);
  window.dispatchEvent(new CustomEvent('wishlist-change'));
  return !has;
}

export function getWishlist(storeSlug: string): string[] {
  return read(storeSlug);
}
