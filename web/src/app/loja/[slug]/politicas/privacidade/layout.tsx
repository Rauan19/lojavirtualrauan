import type { Metadata } from 'next';
import { policyMetadata } from '@/lib/seo';

/**
 * A página em si é client component (usa o StoreShell), então o título e o
 * canonical precisam vir de um layout server ao lado dela.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return policyMetadata(slug, 'privacidade');
}

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
