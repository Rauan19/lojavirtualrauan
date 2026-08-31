import type { Metadata } from 'next';
import {
  Barlow,
  DM_Sans,
  Manrope,
  Playfair_Display,
  Poppins,
} from 'next/font/google';
import { ScrollToTop } from '@/components/ScrollToTop';
import { BRAND } from '@/lib/brand';
import { siteUrl } from '@/lib/seo';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

// Título/destaque da landing. Trocado de uma fonte decorativa (Syne) por
// uma sans profissional — mais séria para quem está decidindo assinar.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-brand',
});

/*
 * Fontes que o lojista pode escolher para a vitrine. preload: false porque
 * cada loja usa só uma — sem isso toda página carregaria as quatro. O
 * arquivo só é baixado quando a família é de fato aplicada.
 */
const storeModern = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-store-modern',
  preload: false,
});

const storeFriendly = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-store-friendly',
  preload: false,
});

const storeElegant = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-store-elegant',
  preload: false,
});

const description =
  'Crie sua loja virtual em minutos: catálogo, pedidos, pagamento por Pix e cartão, frete calculado e domínio próprio. Comece grátis, sem cartão de crédito.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${BRAND.name} | ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description,
  keywords: [
    'criar loja virtual',
    'montar loja online',
    'loja virtual grátis',
    'plataforma de e-commerce',
    'loja online com mensalidade',
    'vender pela internet',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description,
    url: '/',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description,
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  /*
   * Sem esta tag o Search Console nao valida a propriedade — e sem Search
   * Console nao da para submeter o sitemap nem descobrir por qual busca a
   * landing aparece. O codigo sai do proprio painel do Google, em
   * "Verificacao por tag HTML". Vazio = a tag simplesmente nao e emitida.
   */
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${barlow.variable} ${manrope.variable} ${storeModern.variable} ${storeFriendly.variable} ${storeElegant.variable} antialiased`}
      >
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
