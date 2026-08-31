/*
 * Mockup da vitrine nas telas de login e cadastro. Usa as mesmas fotos da
 * hero da landing, para quem chega da landing reconhecer a mesma loja.
 */

const mockupProducts = [
  { img: '/lp/lp-moda-vestido.webp', name: 'Vestido Floral', price: 'R$ 189,90' },
  { img: '/lp/lp-moda-camisa.webp', name: 'Camisa Linho', price: 'R$ 149,90' },
  { img: '/lp/lp-moda-tenis.webp', name: 'Tênis Retrô', price: 'R$ 299,90' },
  { img: '/lp/lp-moda-bone.webp', name: 'Boné Aba Curva', price: 'R$ 79,90' },
] as const;

export function StorefrontMockup({ className = '' }: { className?: string }) {
  return (
    <div
      className={`w-full max-w-[380px] overflow-hidden rounded-lg border border-[#d9dde3] bg-[#fbfbfc] shadow-[0_20px_50px_-20px_rgba(23,26,31,0.35)] ${className}`}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-[#d9dde3] bg-[#f1f2f4] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e0603d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e0b23d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4caf6e]" />
        <span className="ml-2 flex-1 truncate rounded-full bg-white px-3 py-1 text-center text-[10px] text-[#8a92a0]">
          suaLoja.com.br
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-[#d9dde3] bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center bg-accent text-[11px] font-bold text-white">
            S
          </span>
          <span className="text-[13px] font-bold text-[#171a1f]">Sua Loja</span>
        </div>
        <span className="text-[11px] text-[#4a5560]">Carrinho (2)</span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#d9dde3] p-px">
        {mockupProducts.map((p) => (
          <div key={p.name} className="bg-white p-2.5">
            <div className="aspect-square w-full overflow-hidden bg-[#f2f3f5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.img} alt="" className="h-full w-full object-cover" />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-[#171a1f]">{p.name}</p>
            <p className="text-[11px] text-[#4a5560]">{p.price}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#d9dde3] bg-white px-3 py-2.5">
        <span className="inline-block bg-accent px-3 py-1.5 text-[11px] font-bold text-white">
          Finalizar compra
        </span>
      </div>
    </div>
  );
}
