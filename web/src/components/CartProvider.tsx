'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addToCart as addItem,
  cartCount,
  cartSubtotal,
  clearCart as clearItems,
  getCart,
  removeFromCart as removeItem,
  updateQty as setQty,
  type CartItem,
} from '@/lib/cart';

type CartContextValue = {
  storeSlug: string;
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (
    productId: string,
    quantity: number,
    variantId?: string | null,
  ) => void;
  remove: (productId: string, variantId?: string | null) => void;
  clear: () => void;
  refresh: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    setItems(getCart(storeSlug));
  }, [storeSlug]);

  useEffect(() => {
    refresh();
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { storeSlug?: string };
      if (!detail?.storeSlug || detail.storeSlug === storeSlug) refresh();
    };
    window.addEventListener('cart:updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('cart:updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [refresh, storeSlug]);

  const value = useMemo<CartContextValue>(
    () => ({
      storeSlug,
      items,
      count: cartCount(items),
      subtotal: cartSubtotal(items),
      open,
      setOpen,
      add: (item) => {
        addItem(storeSlug, item);
        setOpen(true);
      },
      updateQty: (productId, quantity, variantId) =>
        setQty(storeSlug, productId, quantity, variantId),
      remove: (productId, variantId) =>
        removeItem(storeSlug, productId, variantId),
      clear: () => clearItems(storeSlug),
      refresh,
    }),
    [storeSlug, items, open, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa de CartProvider');
  return ctx;
}
