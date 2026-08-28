import type { Metadata } from 'next';
import { Barlow, Manrope } from 'next/font/google';
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

const description =
  'Crie sua loja virtual em minutos: catálogo, pedidos, pagamento por Pix e cartão, nota fiscal e domínio próprio. Teste grátis por 14 dias, sem cartão de crédito.';

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${barlow.variable} ${manrope.variable} antialiased`}>
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
