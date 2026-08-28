'use client';

import { CustomerProvider } from '@/components/CustomerProvider';

export function StoreClientProviders({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return <CustomerProvider storeSlug={slug}>{children}</CustomerProvider>;
}
