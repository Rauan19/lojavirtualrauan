import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Criar minha loja grátis · ${BRAND.name}`,
  description:
    '14 dias grátis, sem cartão de crédito. Crie sua loja online com vitrine, catálogo, pedidos e pagamento em minutos.',
};

export default function CriarContaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
