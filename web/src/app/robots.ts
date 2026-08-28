import type { MetadataRoute } from 'next';
import { currentHost, siteUrl, storeSlugFromHost } from '@/lib/seo';

export const revalidate = 3600;

/**
 * Painel, conta do cliente e checkout ficam fora do índice: são páginas
 * privadas ou de fluxo, e indexá-las só gera resultado ruim no Google.
 */
const PRIVATE_PATHS = [
  '/admin',
  '/super',
  '/login',
  '/redefinir-senha',
  '/api/',
  '/conta',
  '/checkout',
  '/pedido',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const slug = await storeSlugFromHost();
  const host = await currentHost();

  const base = slug && host ? `https://${host}` : siteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
