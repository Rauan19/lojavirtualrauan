import type { Metadata } from 'next';
import {
  absoluteMedia,
  getProduct,
  getStore,
  metaDescription,
  storeBaseUrl,
} from '@/lib/seo';

type Params = Promise<{ slug: string; idOrSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug, idOrSlug } = await params;
  const [store, product] = await Promise.all([
    getStore(slug),
    getProduct(slug, idOrSlug),
  ]);

  if (!store || !product) {
    return { title: 'Produto não encontrado' };
  }

  const storeName = store.sellerTradeName?.trim() || store.name;
  const price = Number(product.price);
  const description = metaDescription(
    product.description,
    `${product.name} por ${price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })} em ${storeName}.`,
  );
  const url = `${storeBaseUrl(store)}/p/${product.slug || product.id}`;
  const image = absoluteMedia(product.images?.[0]?.url);

  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      url,
      siteName: storeName,
      locale: 'pt_BR',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: product.name,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * JSON-LD de produto: é o que faz o Google mostrar preço e disponibilidade
 * direto no resultado da busca. Sem isso a loja aparece como link seco.
 */
export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { slug, idOrSlug } = await params;
  const [store, product] = await Promise.all([
    getStore(slug),
    getProduct(slug, idOrSlug),
  ]);

  if (!store || !product) return <>{children}</>;

  const url = `${storeBaseUrl(store)}/p/${product.slug || product.id}`;
  const inStock = (product.stock ?? 0) > 0;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description
      ? { description: metaDescription(product.description, product.name) }
      : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.images?.length
      ? {
          image: product.images
            .map((img) => absoluteMedia(img.url))
            .filter((v): v is string => Boolean(v)),
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BRL',
      price: Number(product.price).toFixed(2),
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: store.sellerTradeName?.trim() || store.name,
      },
    },
    ...(product.rating && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.avg.toFixed(1),
            reviewCount: product.rating.count,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Conteúdo é JSON serializado por nós, não HTML do lojista
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      {children}
    </>
  );
}
