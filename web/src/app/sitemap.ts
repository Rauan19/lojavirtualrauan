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

/*
 * Antes o sitemap da plataforma parava na home de cada loja, e os produtos
 * das lojas hospedadas em /loja/[slug] nao entravam em sitemap nenhum — so
 * o das lojas com dominio proprio os listava. Eram justamente as paginas com
 * preco, foto e JSON-LD de Produto que ficavam na ultima fila do rastreador.
 *
 * Os tetos existem porque isto vira uma chamada de catalogo por loja: sem
 * eles, uma plataforma com centenas de lojas derrubaria a geracao do sitemap
 * no timeout. O limite do proprio protocolo e 50.000 URLs por arquivo.
 */
const MAX_STORES_EXPANDED = 150;
const MAX_PRODUCTS_PER_STORE = 300;
const MAX_URLS = 45000;
const POLICY_PATHS = ['termos', 'privacidade', 'trocas'] as const;

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

  /*
   * Loja com dominio proprio fica de fora da expansao: o canonical dela
   * aponta para o proprio dominio, e o sitemap servido naquele host ja lista
   * o catalogo inteiro. Repetir aqui seria oferecer ao Google uma URL que
   * nem e a canonica.
   */
  const hosted = stores
    .filter((store) => !store.customDomain?.trim())
    .slice(0, MAX_STORES_EXPANDED);

  const catalogs = await Promise.all(
    hosted.map(async (store) => {
      const products = asProductList(
        await getProducts(store.slug, MAX_PRODUCTS_PER_STORE),
      );
      const storeBase = `${base}/loja/${store.slug}`;

      return [
        ...products.map((product) => ({
          url: `${storeBase}/p/${product.slug || product.id}`,
          lastModified: product.updatedAt
            ? new Date(product.updatedAt)
            : undefined,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        })),
        ...POLICY_PATHS.map((path) => ({
          url: `${storeBase}/politicas/${path}`,
          changeFrequency: 'yearly' as const,
          priority: 0.2,
        })),
      ];
    }),
  );

  // /login fica de fora de propósito: está no disallow do robots.txt
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/criar-conta`, changeFrequency: 'monthly', priority: 0.9 },
    ...stores.map((store) => ({
      url: `${base}/loja/${store.slug}`,
      lastModified: store.updatedAt ? new Date(store.updatedAt) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...catalogs.flat(),
  ];

  return entries.slice(0, MAX_URLS);
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
