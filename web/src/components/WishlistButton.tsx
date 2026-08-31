'use client';

import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/CustomerProvider';
import {
  addFavoriteApi,
  fetchFavoritesOnce,
  invalidateFavoritesCache,
  removeFavoriteApi,
} from '@/lib/favorites';
import { isWishlisted, toggleWishlist } from '@/lib/wishlist';

type Props = {
  storeSlug: string;
  productId: string;
  className?: string;
  size?: number;
};

export function WishlistButton({ storeSlug, productId, className = '', size = 18 }: Props) {
  const { customer, token } = useCustomer();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (customer && token) {
      fetchFavoritesOnce(storeSlug, customer.id, token).then((set) => {
        setOn(set.has(productId));
      });
      return;
    }
    setOn(isWishlisted(storeSlug, productId));
  }, [storeSlug, productId, customer, token]);

  return (
    <button
      type="button"
      aria-label={on ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);

        if (customer && token) {
          invalidateFavoritesCache(storeSlug, customer.id);
          const call = next
            ? addFavoriteApi(storeSlug, token, productId)
            : removeFavoriteApi(storeSlug, token, productId);
          call
            .then(() => window.dispatchEvent(new CustomEvent('wishlist-change')))
            .catch(() => setOn(!next));
          return;
        }

        setOn(toggleWishlist(storeSlug, productId));
      }}
      className={className}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 20.2l-1.4-1.3C5.6 14.6 3 12.3 3 9.3 3 6.9 4.9 5 7.3 5c1.4 0 2.7.7 3.5 1.7.8-1 2.1-1.7 3.5-1.7C16.7 5 18.6 6.9 18.6 9.3c0 3-2.6 5.3-7.6 9.6L12 20.2z"
          fill={on ? 'var(--store-accent, #d43d54)' : 'rgba(255,255,255,0.85)'}
          stroke={on ? 'var(--store-accent, #d43d54)' : '#171a1f'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
