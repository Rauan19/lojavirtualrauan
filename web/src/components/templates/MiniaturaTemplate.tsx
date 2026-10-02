import { STORE_CARD_RATIOS } from '@/lib/store-theme';
import type { TemplateReceita } from '@/lib/templates';

const FONTE_TITULO: Record<string, string> = {
  elegante: 'var(--font-store-elegant), Georgia, serif',
  impacto: 'var(--font-store-impact), Impact, sans-serif',
  amigavel: 'var(--font-store-friendly), sans-serif',
  moderna: 'var(--font-store-modern), sans-serif',
};

const RAIO = { retos: '0px', suaves: '4px', redondos: '8px' } as const;

/*
 * Miniatura desenhada a partir da receita do template: faixa, cabeçalho,
 * banner e cartões com as cores, cantos, fonte e foto escolhidos. Serve no
 * painel do lojista e no editor do Super Admin (atualiza ao vivo).
 */
export function MiniaturaTemplate({
  receita: r,
  cor,
}: {
  receita: TemplateReceita;
  /** Cor de destaque da loja (ou de exemplo, no Super Admin) */
  cor: string;
}) {
  const fonte =
    FONTE_TITULO[r.fonte ?? ''] ?? 'var(--font-display), sans-serif';
  const proporcao =
    STORE_CARD_RATIOS.find((x) => x.key === r.foto)?.value ?? '1 / 1';
  const cards = Math.min(r.colunas, 5);
  const raio = RAIO[r.cantos];
  const faixa =
    r.faixa === 'preta' ? '#0a0a0a' : r.faixa === 'destaque' ? cor : null;
  return (
    <div
      className="flex aspect-[4/3] w-full flex-col overflow-hidden"
      style={{ background: r.fundo, color: r.texto }}
      aria-hidden
    >
      {faixa ? (
        <div
          className="py-[3px] text-center text-[6.5px] font-bold uppercase tracking-widest text-white"
          style={{ background: faixa }}
        >
          Frete grátis
        </div>
      ) : null}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: r.superficie,
          borderBottom: `1px solid ${r.linha}`,
        }}
      >
        <span className="text-[10px] font-bold" style={{ fontFamily: fonte }}>
          Sua Loja
        </span>
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ background: r.linha }}
        />
      </div>
      <div
        className={`flex h-[28%] shrink-0 items-center px-3 ${
          r.banner === 'caixa' ? 'mx-2 mt-2' : ''
        }`}
        style={{
          background: cor,
          borderRadius: r.banner === 'caixa' ? raio : 0,
        }}
      >
        <span
          className="text-[12px] leading-none text-white"
          style={{
            fontFamily: fonte,
            fontWeight: r.tituloPeso,
            textTransform: r.tituloCaixa === 'alta' ? 'uppercase' : undefined,
          }}
        >
          Nova coleção
        </span>
      </div>
      <div
        className="grid flex-1 content-start gap-1.5 p-2"
        style={{ gridTemplateColumns: `repeat(${cards}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cards }, (_, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col"
            style={
              r.cartao === 'simples'
                ? undefined
                : {
                    background: r.superficie,
                    border:
                      r.cartao === 'contorno'
                        ? `1px solid ${r.linha}`
                        : undefined,
                    borderRadius: raio,
                    padding: 2,
                  }
            }
          >
            <div
              style={{
                aspectRatio: proporcao,
                background: r.escuro ? '#ffffff' : r.corCartao,
                borderRadius: raio,
              }}
            />
            <div
              className="mt-1 h-[3px] w-4/5 rounded-full opacity-40"
              style={{ background: r.texto }}
            />
            <div
              className="mt-0.5 h-[3px] w-1/2 rounded-full"
              style={{ background: r.precoNaCor ? cor : r.texto }}
            />
            {r.compraRapida === 'sempre' ? (
              <div
                className="mt-1 h-[5px] w-full"
                style={{ background: cor, borderRadius: raio }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
