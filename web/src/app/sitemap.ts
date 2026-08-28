import type { MetadataRoute } from 'next';
import {
  asProductList,
  getProducts,
  getPublicStores,
  getStore,
  siteUrl,
  storeSlugFromHost,
} from '@/lib/seo';

// Catálogo muda o tempo todo; não vale congelar no build
export const revalidate = 3600;

/**
 * Um sitemap que serve os dois casos:
 *
 * - domínio próprio de um lojista → páginas daquela loja e seus produtos
 * - domínio da plataforma → landing + vitrine de cada loja
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slug = await storeSlugFromHost();

  if (slug) {
    return storeSitemap(slug);
  }

  const base = siteUrl();
  const stores = (await getPublicStores()) || [];

  // /login fica de fora de propósito: está no disallow do robots.txt
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/criar-conta`, changeFrequency: 'monthly', priority: 0.9 },
    ...stores.map((store) => ({
      url: `${base}/loja/${store.slug}`,
      lastModified: store.updatedAt ? new Date(store.updatedAt) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}

async function storeSitemap(slug: string): Promise<MetadataRoute.Sitemap> {
  const [store, productsRaw] = await Promise.all([
    getStore(slug),
    getProducts(slug),
  ]);
  if (!store) return [];

  // No domínio próprio as rotas são servidas na raiz (o middleware reescreve)
  const base = store.customDomain?.trim()
    ? `https://${store.customDomain.trim().replace(/^www\./, '')}`
    : `${siteUrl()}/loja/${store.slug}`;

  const products = asProductList(productsRaw);

  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    {
      url: `${base}/politicas/termos`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${base}/politicas/privacidade`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${base}/politicas/trocas`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    ...products.map((product) => ({
      url: `${base}/p/${product.slug || product.id}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  ];
}
