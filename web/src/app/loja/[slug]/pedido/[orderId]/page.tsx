'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CartProvider } from '@/components/CartProvider';
import { OrderDoneInner } from './order-done-inner';

export default function OrderDonePage() {
  const params = useParams<{ slug: string; orderId: string }>();
  return (
    <CartProvider storeSlug={params.slug}>
      <Suspense
        fallback={<p className="p-8 text-sm text-muted">Carregando pedido...</p>}
      >
        <OrderDoneInner slug={params.slug} orderId={params.orderId} />
      </Suspense>
    </CartProvider>
  );
}
