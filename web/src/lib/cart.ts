export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image?: string | null;
  quantity: number;
  variantId?: string | null;
  variantLabel?: string | null;
  sku?: string | null;
  /** Até quantas parcelas sem juros (oferta do produto). */
  installmentsFree?: number | null;
};

function key(storeSlug: string) {
  return `cart:${storeSlug}`;
}

function sameLine(
  a: { productId: string; variantId?: string | null },
  b: { productId: string; variantId?: string | null },
) {
  return (
    a.productId === b.productId &&
    (a.variantId || null) === (b.variantId || null)
  );
}

export function cartLineKey(item: {
  productId: string;
  variantId?: string | null;
}) {
  return `${item.productId}::${item.variantId || ''}`;
}

export function getCart(storeSlug: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCart(storeSlug: string, items: CartItem[]) {
  localStorage.setItem(key(storeSlug), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: { storeSlug } }));
}

export function addToCart(
  storeSlug: string,
  item: Omit<CartItem, 'quantity'> & { quantity?: number },
) {
  const cart = getCart(storeSlug);
  const qty = item.quantity ?? 1;
  const idx = cart.findIndex((c) => sameLine(c, item));
  if (idx >= 0) {
    cart[idx] = {
      ...cart[idx],
      quantity: cart[idx].quantity + qty,
      name: item.name,
      price: item.price,
      image: item.image,
      variantLabel: item.variantLabel ?? cart[idx].variantLabel,
      sku: item.sku ?? cart[idx].sku,
      installmentsFree:
        item.installmentsFree ?? cart[idx].installmentsFree ?? null,
    };
  } else {
    cart.push({
      productId: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      quantity: qty,
      variantId: item.variantId ?? null,
      variantLabel: item.variantLabel ?? null,
      sku: item.sku ?? null,
      installmentsFree: item.installmentsFree ?? null,
    });
  }
  setCart(storeSlug, cart);
  return cart;
}

export function updateQty(
  storeSlug: string,
  productId: string,
  quantity: number,
  variantId?: string | null,
) {
  let cart = getCart(storeSlug);
  const match = { productId, variantId };
  if (quantity <= 0) {
    cart = cart.filter((c) => !sameLine(c, match));
  } else {
    cart = cart.map((c) =>
      sameLine(c, match) ? { ...c, quantity } : c,
    );
  }
  setCart(storeSlug, cart);
  return cart;
}

export function removeFromCart(
  storeSlug: string,
  productId: string,
  variantId?: string | null,
) {
  const cart = getCart(storeSlug).filter(
    (c) => !sameLine(c, { productId, variantId }),
  );
  setCart(storeSlug, cart);
  return cart;
}

export function clearCart(storeSlug: string) {
  setCart(storeSlug, []);
}

export function cartCount(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}
