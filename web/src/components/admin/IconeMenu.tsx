/**
 * Ícones do menu lateral do painel (padrão Nuvemshop/Shopify: cada item com
 * o seu). Traço único de 1,7 e 20px, desenhados aqui para não depender de
 * biblioteca. A chave é o endereço da tela.
 */
const TRACOS: Record<string, string[]> = {
  '/admin': [
    'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z',
  ],
  '/admin/products': ['M4 8l8-4 8 4-8 4-8-4Z', 'M4 8v8l8 4 8-4V8', 'M12 12v8'],
  '/admin/categories': ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  '/admin/promotions': [
    'M6 18 18 6',
    'M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  ],
  '/admin/reviews': [
    'm12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8L12 4Z',
  ],
  '/admin/orders': ['M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z', 'M9 8h6M9 12h6'],
  '/admin/refunds': ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v4h4'],
  '/admin/carrinhos-abandonados': [
    'M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7H6',
    'M9 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  ],
  '/admin/customers': [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.3a3.5 3.5 0 0 1 0 6.4M21.5 20a6.5 6.5 0 0 0-4-6',
  ],
  '/admin/coupons': [
    'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5V7Z',
    'M10 9v6',
  ],
  '/admin/catalogo': ['M4 10v4h3l6 4V6L7 10H4Z', 'M16.5 9a4 4 0 0 1 0 6'],
  '/admin/avise-me': [
    'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z',
    'M10 20a2 2 0 0 0 4 0',
  ],
  '/admin/settings': [
    'M4 9.5 5.5 4h13L20 9.5',
    'M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0',
    'M5 11.5V20h14v-8.5',
  ],
  '/admin/settings/planos': ['M3.5 6.5h17v11h-17z', 'M3.5 10h17', 'M7 14.5h4'],
  '/admin/equipe': [
    'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M5 20a7 7 0 0 1 14 0',
  ],
  '/admin/avisos': [
    'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
    'M11 18h2',
  ],
  '/admin/settings/seguranca': [
    'M12 3.5 5 6.5V12c0 4.2 3 7.6 7 8.5 4-.9 7-4.3 7-8.5V6.5l-7-3Z',
    'm9 12 2 2 4-4',
  ],
  '/admin/templates': [
    'M4 5.5h16v13H4z',
    'M4 9.5h16',
    'M9 9.5v9',
    'M12.5 13h4.5M12.5 15.5h3',
  ],
  // Super Admin
  '/super': ['M4 20V10M10 20V4M16 20v-7M21 20H3'],
  '/super/lojas': [
    'M4 9.5 5.5 4h13L20 9.5',
    'M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0',
    'M5 11.5V20h14v-8.5',
    'M10 20v-4.5h4V20',
  ],
  '/super/planos': [
    'm12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z',
    'm3.5 12 8.5 4.5 8.5-4.5',
    'm3.5 16 8.5 4.5 8.5-4.5',
  ],
  '/super/templates': [
    'M4 5.5h16v13H4z',
    'M4 9.5h16',
    'M9 9.5v9',
    'M12.5 13h4.5M12.5 15.5h3',
  ],
  '/super/comissoes': [
    'M18 6 6 18',
    'M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z',
  ],
  '/super/mercadopago': [
    'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3',
    'M4 7.5V17a2 2 0 0 0 2 2h14V9H6.5A2.5 2.5 0 0 1 4 7.5Z',
    'M16.5 14h.01',
  ],
  '/super/equipe': [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.2A6.5 6.5 0 0 1 21.5 20',
  ],
  '/super/seguranca': [
    'M12 3.5 5 6.5V12c0 4.2 3 7.6 7 8.5 4-.9 7-4.3 7-8.5V6.5l-7-3Z',
    'm9 12 2 2 4-4',
  ],
  '/admin/suporte': [
    'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z',
    'M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6',
    'M12 16.8h.01',
  ],
};

export function IconeMenu({ href }: { href: string }) {
  const tracos = TRACOS[href];
  if (!tracos) return <span className="h-5 w-5 shrink-0" aria-hidden />;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {tracos.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
