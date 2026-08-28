'use client';

import { useParams } from 'next/navigation';
import { CustomerAccountShell } from '@/components/CustomerAccountShell';

export default function ContaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ slug: string }>();

  return (
    <CustomerAccountShell storeSlug={params.slug}>
      {children}
    </CustomerAccountShell>
  );
}
