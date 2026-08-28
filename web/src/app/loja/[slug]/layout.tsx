import type { Metadata } from 'next';
import {
  absoluteMedia,
  getStore,
  metaDescription,
  storeBaseUrl,
} from '@/lib/seo';
import { StoreClientProviders } from './store-shell-client';

/**
 * Server component só por causa do `generateMetadata` — sem isso a vitrine
 * compartilhada no WhatsApp/Instagram aparece sem título, sem imagem e sem
 * descrição, e o Google indexa o título do app inteiro em todas as lojas.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) {
    return { title: 'Loja não encontrada' };
  }

  const name = store.sellerTradeName?.trim() || store.name;
  const local = [store.sellerCity, store.sellerState].filter(Boolean).join('/');
  const description = metaDescription(
    null,
    `Compre em ${name}${local ? ` · ${local}` : ''}. Entrega para todo o Brasil, pagamento por Pix, cartão ou boleto.`,
  );
  const url = storeBaseUrl(store);
  const image = absoluteMedia(store.logoUrl);

  return {
    metadataBase: new URL(url),
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description,
      url,
      locale: 'pt_BR',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: name,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StoreClientProviders slug={slug}>{children}</StoreClientProviders>;
}
