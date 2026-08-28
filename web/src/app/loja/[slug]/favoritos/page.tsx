'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CartDrawer } from '@/components/CartDrawer';
import { CartProvider, useCart } from '@/components/CartProvider';
import { useCustomer } from '@/components/CustomerProvider';
import { StoreShell } from '@/components/StoreShell';
import { WishlistButton } from '@/components/WishlistButton';
import { api, mediaUrl, money } from '@/lib/api';
import { fetchFavoritesOnce, invalidateFavoritesCache } from '@/lib/favorites';
import { getWishlist } from '@/lib/wishlist';

type Store = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  sellerPhone?: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  price: string;
  images: { url: string }[];
};

export default function FavoritosPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CartProvider storeSlug={params.slug}>
      <FavoritosInner slug={params.slug} />
    </CartProvider>
  );
}

function FavoritosInner({ slug }: { slug: string }) {
  const cart = useCart();
  const { customer, token } = useCustomer();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<Store>(`/stores/public/${slug}`).then(setStore);
  }, [slug]);

  useEffect(() => {
    function load() {
      const idsPromise =
        customer && token
          ? fetchFavoritesOnce(slug, customer.id, token).then((set) => Array.from(set))
          : Promise.resolve(getWishlist(slug));

      idsPromise.then((ids) => {
        if (!ids.length) {
          setProducts([]);
          setLoaded(true);
          return;
        }
        Promise.all(
          ids.map((id) =>
            api<Product>(`/catalog/products/${id}`, { storeSlug: slug }).catch(() => null),
          ),
        ).then((list) => {
          setProducts(list.filter((p): p is Product => !!p));
          setLoaded(true);
        });
      });
    }
    if (customer && token) invalidateFavoritesCache(slug, customer.id);
    load();
    window.addEventListener('wishlist-change', load);
    return () => window.removeEventListener('wishlist-change', load);
  }, [slug, customer, token]);

  if (!store) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  return (
    <>
      <StoreShell
        storeName={store.name}
        logoUrl={mediaUrl(store.logoUrl)}
        primaryColor={store.primaryColor || '#1a1a1a'}
        accentColor={store.accentColor || '#e31c5f'}
        search={q}
        onSearch={(v) => setQ(v)}
        homeHref={`/loja/${slug}`}
        storeSlug={slug}
        sellerPhone={store.sellerPhone}
        cartCount={cart.count}
        onOpenCart={() => cart.setOpen(true)}
      >
        <div className="mx-auto max-w-[1200px] px-3 py-4 md:px-4 md:py-6">
          <h1 className="text-lg font-bold md:text-xl">Favoritos</h1>

          {loaded && products.length === 0 ? (
            <p className="mt-6 text-sm text-muted">
              Você ainda não favoritou nenhum produto.{' '}
              <Link href={`/loja/${slug}`} className="font-semibold underline">
                Ver catálogo
              </Link>
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-x-1.5 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-2 lg:gap-y-4">
              {products.map((p) => {
                const img = mediaUrl(p.images[0]?.url);
                const href = `/loja/${slug}/p/${p.slug || p.id}`;
                return (
                  <article key={p.id} className="flex flex-col">
                    <Link href={href} className="relative aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={p.name} className="h-full w-full object-cover" />
                      ) : null}
                      <WishlistButton
                        storeSlug={slug}
                        productId={p.id}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/85 shadow-sm"
                      />
                    </Link>
                    <Link href={href} className="mt-1.5">
                      <h2 className="line-clamp-2 text-[12px] leading-snug md:text-[13px]">{p.name}</h2>
                    </Link>
                    <strong className="mt-0.5 text-[13px] md:text-sm">{money(Number(p.price))}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </StoreShell>
      <CartDrawer checkoutHref={`/loja/${slug}/checkout`} />
    </>
  );
}
