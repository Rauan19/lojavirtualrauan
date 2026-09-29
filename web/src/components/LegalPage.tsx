import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { LEGAL, dataVersao, empresaIdentificada } from '@/lib/legal';

type Props = {
  titulo: string;
  versao: string;
  resumo: ReactNode;
  children: ReactNode;
};

/** Moldura dos textos legais da plataforma (termos, privacidade). */
export function LegalPage({ titulo, versao, resumo, children }: Props) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-ink">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-4">
          <Link href="/" aria-label={`${LEGAL.marca} — página inicial`}>
            <BrandLogo height={34} />
          </Link>
          <nav className="flex gap-4 text-sm text-muted">
            <Link href="/termos" className="hover:text-ink">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-ink">
              Privacidade
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[860px] px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">
          Versão de {dataVersao(versao)} · {empresaIdentificada()}
        </p>
        <div className="mt-6 rounded-xl bg-white p-5 text-[15px] leading-relaxed shadow-sm ring-1 ring-black/5">
          {resumo}
        </div>
        <article className="legal-text mt-8 space-y-8 text-[15.5px] leading-[1.7] text-[#2b3036] [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mb-3 [&_li]:ml-5 [&_li]:list-disc [&_li]:mb-1.5 [&_p]:mb-3 [&_strong]:text-ink">
          {children}
        </article>
      </main>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-[860px] space-y-1 px-4 py-6 text-sm text-muted">
          <p>{empresaIdentificada()}</p>
          {LEGAL.endereco ? <p>{LEGAL.endereco}</p> : null}
          {LEGAL.emailContato ? <p>Contato: {LEGAL.emailContato}</p> : null}
        </div>
      </footer>
    </div>
  );
}
