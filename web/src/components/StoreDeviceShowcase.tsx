'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * Hero da landing: notebook e celular com a vitrine rolando dentro, trocando
 * de loja a cada poucos segundos. Cada loja muda cor, fonte, proporção da
 * foto e catálogo — que é exatamente o que a plataforma faz quando o lojista
 * escolhe o ramo. Em vez de prometer "sua loja com a sua cara", a hero
 * mostra acontecendo.
 *
 * A vitrine é desenhada em tamanho real (1200px no notebook, 390px no
 * celular) e reduzida por transform: scale. É o que dá a sensação de página
 * de verdade — desenhar direto em miniatura sempre sai com cara de zoom.
 *
 * Toda a animação é CSS: nada aqui depende de requestAnimationFrame, então a
 * cena não fica congelada quando a aba volta de segundo plano.
 */

type Persona = {
  name: string;
  domain: string;
  accent: string;
  font: string;
  ratio: string;
  banner: string;
  categories: string[];
  products: { img: string; name: string; price: string }[];
};

const PERSONAS: Persona[] = [
  {
    name: 'Ateliê Lua',
    domain: 'atelielua.com.br',
    accent: '#b5485f',
    font: 'var(--font-store-elegant), Georgia, serif',
    ratio: '3 / 4',
    banner: 'Nova coleção de inverno',
    categories: ['Novidades', 'Feminino', 'Masculino', 'Calçados', 'Acessórios', 'Promoções'],
    products: [
      { img: '/lp/lp-moda-vestido.webp', name: 'Vestido Floral Alcinha', price: 'R$ 189,90' },
      { img: '/lp/lp-moda-camisa.webp', name: 'Camisa Linho Manga Curta', price: 'R$ 149,90' },
      { img: '/lp/lp-moda-tenis.webp', name: 'Tênis Retrô Sola Caramelo', price: 'R$ 299,90' },
      { img: '/lp/lp-moda-bone.webp', name: 'Boné Aba Curva Lavado', price: 'R$ 79,90' },
      { img: '/lp/lp-moda-mochila.webp', name: 'Mochila Canvas Couro', price: 'R$ 259,90' },
      { img: '/lp/lp-moda-tenis-lilas.webp', name: 'Tênis Leve Feminino', price: 'R$ 219,90' },
    ],
  },
  {
    name: 'Eletro Vale',
    domain: 'eletrovale.com.br',
    accent: '#2f6fd0',
    font: 'var(--font-store-modern), system-ui, sans-serif',
    ratio: '1 / 1',
    banner: 'Semana do eletro',
    categories: ['Celulares', 'TVs', 'Eletrodomésticos', 'Informática', 'Ofertas'],
    products: [
      { img: '/lp/lp-eletro-celular.webp', name: 'Smartphone 128 GB', price: 'R$ 1.899,00' },
      { img: '/lp/lp-eletro-tv.webp', name: 'Smart TV 43" HD', price: 'R$ 1.599,00' },
      { img: '/lp/lp-eletro-geladeira.webp', name: 'Geladeira Frost Free 395L', price: 'R$ 3.299,00' },
      { img: '/lp/lp-eletro-fogao.webp', name: 'Fogão 4 Bocas Inox', price: 'R$ 899,00' },
    ],
  },
];

function ProductCard({ persona, i }: { persona: Persona; i: number }) {
  const p = persona.products[i % persona.products.length];
  return (
    <div>
      <div className="overflow-hidden bg-[#f2f3f5]" style={{ aspectRatio: persona.ratio }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.img} alt="" className="h-full w-full object-cover" />
      </div>
      <p className="mt-2 truncate text-[13px] leading-snug text-[#171a1f]">{p.name}</p>
      <p className="mt-0.5 text-[15px] font-bold" style={{ color: persona.accent }}>
        {p.price}
      </p>
    </div>
  );
}

/** Uma "tela" completa da loja, repetida duas vezes para a rolagem emendar. */
function StorePage({ persona, mobile }: { persona: Persona; mobile: boolean }) {
  const cols = mobile ? 2 : 4;
  const cards = mobile ? 6 : 8;

  return (
    <div style={{ fontFamily: persona.font }}>
      <header className="flex items-center gap-4 border-b border-[#e6e8ec] bg-white px-5 py-4">
        <span
          className="whitespace-nowrap text-[20px] font-bold tracking-tight"
          style={{ color: persona.accent }}
        >
          {persona.name}
        </span>
        <span className="h-9 flex-1 rounded-sm border border-[#e6e8ec] bg-[#f7f8fa]" />
        <span className="h-6 w-6 rounded-full bg-[#f0f1f3]" />
        {!mobile ? <span className="h-6 w-6 rounded-full bg-[#f0f1f3]" /> : null}
      </header>

      <nav className="flex gap-5 border-b border-[#e6e8ec] bg-white px-5 py-2.5">
        {persona.categories.slice(0, mobile ? 3 : 6).map((c, i) => (
          <span
            key={c}
            className="whitespace-nowrap text-[13px]"
            style={{
              color: i === 0 ? persona.accent : '#5c6470',
              fontWeight: i === 0 ? 600 : 400,
            }}
          >
            {c}
          </span>
        ))}
      </nav>

      <div
        className="mx-5 mt-5 flex items-center px-6"
        style={{
          height: mobile ? 96 : 150,
          background: `linear-gradient(100deg, ${persona.accent} 0%, color-mix(in srgb, ${persona.accent} 55%, #1f2430) 100%)`,
        }}
      >
        <div>
          <p className="text-[19px] font-bold leading-tight text-white">{persona.banner}</p>
          <p className="mt-1 text-[13px] text-white/80">Frete grátis acima de R$ 199</p>
        </div>
      </div>

      <div className={`grid gap-4 px-5 py-5 ${mobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {Array.from({ length: cards }, (_, i) => (
          <ProductCard key={i} persona={persona} i={i} />
        ))}
      </div>
      {/* espaço morto no fim para o loop não emendar produto com header */}
      <div style={{ height: cols * 4 }} />
    </div>
  );
}

function Device({
  persona,
  mobile,
  width,
  slow,
}: {
  persona: Persona;
  mobile: boolean;
  /** Largura real em que a vitrine é desenhada, antes de reduzir. */
  width: number;
  slow?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  /*
   * A moldura é fluida, então a redução tem que ser medida: chutar um valor
   * fixo deixa a vitrine estourando ou sobrando dentro da tela conforme a
   * largura da janela.
   */
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const apply = () => setScale(el.clientWidth / width);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div className="lp-viewport" ref={frame}>
      <div
        className={`lp-scroll ${slow ? 'lp-scroll-slow' : ''}`}
        style={
          {
            width,
            '--lp-scale': scale,
            visibility: scale ? 'visible' : 'hidden',
          } as React.CSSProperties
        }
      >
        <StorePage persona={persona} mobile={mobile} />
        <StorePage persona={persona} mobile={mobile} />
      </div>
    </div>
  );
}

export function StoreDeviceShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % PERSONAS.length),
      5200,
    );
    return () => window.clearInterval(t);
  }, []);

  const persona = PERSONAS[index];

  return (
    <div className="lp-stage" aria-hidden>
      <div className="lp-laptop">
        <div className="lp-laptop-screen">
          <div className="lp-laptop-bar">
            <span className="lp-dot" style={{ background: '#e0603d' }} />
            <span className="lp-dot" style={{ background: '#e0b23d' }} />
            <span className="lp-dot" style={{ background: '#4caf6e' }} />
            <span className="lp-url">{persona.domain}</span>
          </div>
          <Device persona={persona} mobile={false} width={1200} />
        </div>
        <div className="lp-laptop-base" />
      </div>

      <div className="lp-phone">
        <span className="lp-phone-notch" />
        <Device persona={persona} mobile width={390} slow />
      </div>

      <div className="lp-dots">
        {PERSONAS.map((p, i) => (
          <span
            key={p.name}
            className="lp-dots-item"
            style={{
              background: i === index ? persona.accent : '#c9ced6',
              width: i === index ? 16 : 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
