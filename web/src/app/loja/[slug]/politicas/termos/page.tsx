'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { StoreShell } from '@/components/StoreShell';
import { api, mediaUrl } from '@/lib/api';

type Store = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  termsHtml?: string | null;
};

const FALLBACK = `
<p>Ao comprar nesta loja, você concorda com as condições de venda, pagamento e entrega informadas no checkout.</p>
<p>Preços e disponibilidade podem mudar sem aviso prévio.</p>
<p>Para dúvidas sobre o pedido, use a área Minha conta ou o atendimento da loja.</p>
`;

export default function TermsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api<Store>(`/stores/public/${slug}`)
      .then(setStore)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-muted">{error}</p>
      </main>
    );
  }

  if (!store) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted">
        Carregando...
      </main>
    );
  }

  const html = store.termsHtml?.trim() || FALLBACK;

  return (
    <StoreShell
      storeName={store.name}
      logoUrl={mediaUrl(store.logoUrl)}
      primaryColor={store.primaryColor || '#1a1a1a'}
      accentColor={store.accentColor || '#e31c5f'}
      search={q}
      onSearch={setQ}
      homeHref={`/loja/${slug}`}
      storeSlug={slug}
    >
      <div className="mx-auto max-w-[720px] px-4 py-8">
        <Link href={`/loja/${slug}`} className="text-sm text-muted hover:text-ink">
          ← Voltar à loja
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Termos de uso</h1>
        <div
          className="prose-store mt-6 space-y-3 text-sm leading-relaxed text-[#333] [&_a]:underline [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </StoreShell>
  );
}
