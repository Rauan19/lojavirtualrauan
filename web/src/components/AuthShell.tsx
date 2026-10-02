import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { StorefrontMockup } from '@/components/StorefrontMockup';

/*
 * Moldura das telas de entrar e criar conta do lojista, no padrão das
 * plataformas grandes (Nuvemshop, Shopify): a página inteira na cor da
 * marca, o formulário num cartão branco arredondado e, do outro lado, a
 * prova — a vitrine funcionando — no lugar de foto de banco de imagem.
 *
 * A logo mora dentro do cartão: a turquesa dela some sobre o fundo escuro.
 */

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden className="mt-px shrink-0">
      <circle cx="10" cy="10" r="10" fill="var(--brand-coral)" />
      <path
        d="M6 10.2l2.4 2.4L14 7"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  headline: ReactNode;
  subhead: string;
  perks: string[];
  footNote: ReactNode;
  children: ReactNode;
};

export function AuthShell({ headline, subhead, perks, footNote, children }: Props) {
  return (
    <main className="auth-stage min-h-screen text-white">
      <div className="mx-auto grid min-h-screen max-w-[1240px] content-start gap-6 px-4 py-8 md:grid-cols-[minmax(0,440px)_minmax(0,1fr)] md:content-center md:items-center md:gap-14 md:px-8 md:py-10 lg:gap-20">
        {/* No celular o título vem antes do cartão, no fundo da marca */}
        <p className="max-w-[18ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.08] tracking-tight text-balance md:hidden">
          {headline}
        </p>
        <section className="auth-card w-full rounded-[22px] bg-white p-6 text-ink shadow-[0_30px_70px_-30px_rgba(4,24,29,0.65)] sm:p-9">
          <Link href="/" className="mb-7 inline-block" aria-label="Vendira, página inicial">
            <BrandLogo height={40} priority />
          </Link>
          {children}
          <p className="mt-7 border-t border-[#eceef1] pt-5 text-[13px] text-[#4a5560]">
            {footNote}
          </p>
        </section>

        <section className="hidden min-h-0 md:block">
          <h1 className="max-w-[16ch] font-[family-name:var(--font-brand)] text-[2.5rem] font-800 leading-[1.04] tracking-tight text-balance lg:text-[3.1rem]">
            {headline}
          </h1>
          <p className="mt-4 max-w-[40ch] text-[16px] leading-relaxed text-white/80">
            {subhead}
          </p>
          <ul className="mt-7 space-y-3">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 text-[15px] leading-snug text-white/90">
                <CheckIcon />
                {perk}
              </li>
            ))}
          </ul>
          <div className="auth-proof mt-10" aria-hidden>
            <StorefrontMockup className="max-w-[360px]" />
          </div>
        </section>
      </div>
    </main>
  );
}
