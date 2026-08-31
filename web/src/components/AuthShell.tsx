import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { StorefrontMockup } from '@/components/StorefrontMockup';

/*
 * Moldura das telas de login e cadastro do lojista. Repete a linguagem da
 * landing — fundo #f7f8fa, filete #d9dde3, tipografia da marca e o mesmo
 * mockup da hero — pra quem cria a conta continuar na mesma loja visual em
 * vez de cair numa tela genérica de formulário.
 */

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      aria-hidden
      className="mt-[3px] shrink-0"
    >
      <circle cx="10" cy="10" r="9" stroke="var(--accent)" strokeWidth="1.4" />
      <path
        d="M6 10.2l2.4 2.4L14 7"
        stroke="var(--accent)"
        strokeWidth="1.6"
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
    <main className="grid min-h-screen bg-[#f7f8fa] text-ink md:h-screen md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:overflow-hidden">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-[#d9dde3] bg-[#eef0f3] px-10 pb-0 pt-10 md:flex lg:px-14">
        <div>
          <Link href="/" className="inline-block">
            <BrandLogo height={58} withTagline priority className="lg:hidden" />
            <BrandLogo height={84} withTagline priority className="hidden lg:block" />
          </Link>
          <h1 className="mt-10 max-w-[15ch] font-[family-name:var(--font-brand)] text-[2.1rem] font-800 leading-[1.06] tracking-tight text-[#171a1f] lg:text-[2.5rem]">
            {headline}
          </h1>
          <p className="mt-3.5 max-w-[34ch] text-[15px] leading-relaxed text-[#4a5560]">
            {subhead}
          </p>
          <ul className="mt-7 space-y-2.5">
            {perks.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-2.5 text-[14px] leading-snug text-[#4a5560]"
              >
                <CheckIcon />
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-7 text-[13px] text-[#4a5560]">{footNote}</p>

        {/*
          O mockup ocupa o que sobrou da coluna e é cortado por baixo. Ancorar
          pelo fim (self-end) fazia ele transbordar por cima do texto quando a
          tela era baixa; começando pelo topo, o corte cai sempre no rodapé da
          arte, que é onde não faz falta.
        */}
        <div className="mt-8 flex min-h-0 flex-1 items-start justify-center overflow-hidden">
          <StorefrontMockup className="max-w-[320px] shrink-0" />
        </div>
      </section>

      <section className="flex items-center justify-center bg-white px-4 py-10 md:h-full md:overflow-y-auto md:px-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-6 inline-block md:hidden">
            <BrandLogo height={34} />
          </Link>
          {children}
          <p className="mt-7 text-[13px] text-[#4a5560] md:hidden">{footNote}</p>
        </div>
      </section>
    </main>
  );
}
