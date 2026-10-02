import Image from 'next/image';

/*
 * Peças visuais da landing. Os prints são da loja de exemplo de verdade
 * (public/site/), e o painel e o checkout são desenhados com os mesmos
 * elementos das telas reais: o lojista vê o que vai receber, sem foto de
 * banco.
 */

/** Cor da loja de exemplo dos prints (Perfumaria SDG) */
const LOJA_COR = '#46305c';

export function Celular({
  src,
  alt,
  className = '',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative aspect-[390/844] overflow-hidden rounded-[2.6rem] border-[9px] border-[#111418] bg-[#111418] shadow-[0_30px_60px_-28px_rgba(13,58,67,0.55)] ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 768px) 300px, 70vw"
        priority={priority}
        className="rounded-[1.95rem] object-cover object-top"
      />
    </div>
  );
}

export function Notebook({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-t-[14px] border-[8px] border-b-0 border-[#111418] bg-[#111418] shadow-[0_30px_60px_-30px_rgba(13,58,67,0.5)]">
        <div className="relative aspect-[1440/900] overflow-hidden rounded-t-[6px] bg-white">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 640px, 92vw"
            className="object-cover object-top"
          />
        </div>
      </div>
      {/* base do notebook, um pouco mais larga que a tela */}
      <div className="relative -mx-[5%] h-3 rounded-b-[10px] bg-gradient-to-b from-[#d6dadf] to-[#aab1b9]">
        <div className="absolute left-1/2 top-0 h-1.5 w-[16%] -translate-x-1/2 rounded-b-md bg-[#9aa1a9]" />
      </div>
    </div>
  );
}

function Sino() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A notificação que o lojista recebe no celular quando um pedido é pago */
export function AvisoVendeu({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex w-[17.5rem] items-start gap-3 rounded-2xl bg-white/95 p-3.5 shadow-[0_18px_40px_-16px_rgba(13,58,67,0.5)] ring-1 ring-black/5 backdrop-blur ${className}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-deep)] text-white">
        <Sino />
      </span>
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="flex items-baseline justify-between gap-2">
          <strong className="text-[#171a1f]">Você vendeu!</strong>
          <span className="text-[11px] text-[#6b7480]">agora</span>
        </p>
        <p className="mt-0.5 text-[#4a5560]">
          Pedido #1042 · <strong className="text-[#171a1f]">R$ 749,90</strong> no Pix
        </p>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Resumo do checkout: frete pelo CEP e as formas de pagamento */
export function CheckoutMock() {
  return (
    <div className="w-full max-w-[25rem] rounded-[20px] bg-white p-5 text-[14px] shadow-[0_30px_60px_-30px_rgba(13,58,67,0.45)] ring-1 ring-black/5">
      <p className="text-[13px] font-semibold text-[#4a5560]">Entrega para 40015-970</p>
      <ul className="mt-2.5 space-y-2">
        {[
          ['PAC', '6 dias úteis', 'R$ 22,90', false],
          ['SEDEX', '2 dias úteis', 'R$ 38,40', true],
          ['Jadlog', '4 dias úteis', 'R$ 27,10', false],
        ].map(([nome, prazo, valor, marcado]) => (
          <li
            key={nome as string}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              marcado ? 'border-[#171a1f] bg-[#fafafa]' : 'border-[#e3e6ea]'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                marcado ? 'border-[#171a1f]' : 'border-[#c5cbd2]'
              }`}
            >
              {marcado ? <span className="h-1.5 w-1.5 rounded-full bg-[#171a1f]" /> : null}
            </span>
            <span className="flex-1">
              <strong className="font-semibold text-[#171a1f]">{nome}</strong>{' '}
              <span className="text-[#6b7480]">· {prazo}</span>
            </span>
            <span className="font-semibold tabular-nums text-[#171a1f]">{valor}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[13px] font-semibold text-[#4a5560]">Pagamento</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border-2 border-[#171a1f] px-3 py-2.5">
          <p className="font-bold text-[#171a1f]">Pix</p>
          <p className="text-[12px] font-semibold text-[var(--ok)]">aprovado na hora</p>
        </div>
        <div className="rounded-xl border border-[#e3e6ea] px-3 py-2.5">
          <p className="font-bold text-[#171a1f]">Cartão</p>
          <p className="text-[12px] text-[#6b7480]">em até 12x</p>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-[#ebedf0] pt-4">
        <span className="text-[#4a5560]">Total</span>
        <strong className="text-[1.35rem] tabular-nums text-[#171a1f]">R$ 788,30</strong>
      </div>
      <div
        className="mt-3 flex h-12 items-center justify-center rounded-xl text-[15px] font-bold text-white"
        style={{ background: LOJA_COR }}
      >
        Pagar com Pix
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#4a5560]">
        <span className="text-[var(--ok)]">
          <Check />
        </span>
        O dinheiro cai direto na conta da loja
      </p>
    </div>
  );
}

const PEDIDOS: [string, string, string, 'ok' | 'envio' | 'espera'][] = [
  ['#1042', 'Mariana C.', 'R$ 749,90', 'ok'],
  ['#1041', 'Rafael S.', 'R$ 329,90', 'envio'],
  ['#1040', 'Juliana A.', 'R$ 89,90', 'espera'],
  ['#1039', 'Pedro H.', 'R$ 1.149,80', 'envio'],
];

const STATUS = {
  ok: ['Pago', 'bg-[#e8f6ee] text-[#166534]'],
  envio: ['Enviado', 'bg-[#e9f1f3] text-[var(--brand-deep)]'],
  espera: ['Aguardando Pix', 'bg-[#fff6e0] text-[#8a5a00]'],
} as const;

/** O painel do lojista: menu, números do dia e últimos pedidos */
export function PainelMock() {
  return (
    <div className="flex w-full overflow-hidden rounded-[20px] bg-white text-[13px] shadow-[0_30px_60px_-30px_rgba(13,58,67,0.45)] ring-1 ring-black/5">
      <div className="hidden w-[30%] shrink-0 flex-col gap-1 bg-[#f4f6f8] p-3 sm:flex">
        <div className="mb-2 flex items-center gap-2 px-2 py-1.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ background: LOJA_COR }}
          >
            SDG
          </span>
          <span className="truncate font-semibold text-[#171a1f]">Perfumaria SDG</span>
        </div>
        {['Início', 'Pedidos', 'Produtos', 'Clientes', 'Cupons', 'Frete'].map((item, i) => (
          <span
            key={item}
            className={`rounded-lg px-2.5 py-1.5 ${
              i === 1 ? 'bg-[var(--brand-deep)] font-semibold text-white' : 'text-[#4a5560]'
            }`}
          >
            {item}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <p className="text-[15px] font-bold text-[#171a1f]">Pedidos</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['Vendido hoje', 'R$ 2.319,50'],
            ['Pedidos', '18'],
            ['A enviar', '5'],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-xl border border-[#e3e6ea] px-2.5 py-2">
              <p className="truncate text-[11px] text-[#6b7480]">{rotulo}</p>
              <p className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-[#171a1f]">{valor}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-[#ebedf0] rounded-xl border border-[#e3e6ea]">
          {PEDIDOS.map(([n, cliente, valor, s]) => (
            <li key={n} className="flex items-center gap-2 px-3 py-2.5">
              <span className="w-11 shrink-0 font-semibold text-[#171a1f]">{n}</span>
              <span className="min-w-0 flex-1 truncate text-[#4a5560]">{cliente}</span>
              <span className="hidden font-semibold tabular-nums text-[#171a1f] min-[420px]:inline">{valor}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[s][1]}`}>
                {STATUS[s][0]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
