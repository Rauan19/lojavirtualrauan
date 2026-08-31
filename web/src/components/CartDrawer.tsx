'use client';

import Link from 'next/link';
import { mediaUrl, money } from '@/lib/api';
import { useCart } from '@/components/CartProvider';
import { cartLineKey } from '@/lib/cart';

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyBagIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden className="text-muted">
      <path
        d="M6.5 8.5h11l-.8 10.2a1.5 1.5 0 01-1.5 1.3H8.8a1.5 1.5 0 01-1.5-1.3L6.5 8.5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * `accentColor` vem por prop porque o drawer é renderizado fora do
 * StoreShell — sem isso ele não herda a cor da loja e o botão de finalizar
 * sai com o rosa da plataforma.
 */
export function CartDrawer({
  checkoutHref,
  accentColor,
}: {
  checkoutHref: string;
  accentColor?: string | null;
}) {
  const { items, open, setOpen, updateQty, remove, subtotal, count } = useCart();

  if (!open) return null;

  const themeVars = accentColor
    ? ({
        '--store-accent': accentColor,
        '--store-accent-hover': `color-mix(in srgb, ${accentColor} 86%, #000)`,
      } as React.CSSProperties)
    : undefined;

  return (
    <>
      <div
        className="drawer-backdrop open"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-xl"
        style={themeVars}
        role="dialog"
        aria-label="Sacola"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <strong className="text-sm">Sacola{count > 0 ? ` (${count})` : ''}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <EmptyBagIcon />
              <p className="text-sm font-semibold text-ink">Sua sacola está vazia</p>
              <p className="text-xs text-muted">Adicione produtos pra continuar a compra.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const img = mediaUrl(item.image);
                return (
                  <li key={cartLineKey(item)} className="flex gap-3 px-4 py-3">
                    <div className="h-20 w-16 shrink-0 overflow-hidden bg-[#f3f3f3]">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <button
                          type="button"
                          className="icon-btn -mr-1.5 -mt-1 h-7 w-7 shrink-0 text-muted hover:text-accent"
                          aria-label="Remover item"
                          onClick={() => remove(item.productId, item.variantId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      {item.variantLabel ? (
                        <p className="mt-0.5 text-xs text-muted">{item.variantLabel}</p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center border border-line">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center text-ink hover:bg-[#f7f8fa]"
                            aria-label="Diminuir quantidade"
                            onClick={() =>
                              updateQty(item.productId, item.quantity - 1, item.variantId)
                            }
                          >
                            <MinusIcon />
                          </button>
                          <span className="w-7 text-center text-sm tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center text-ink hover:bg-[#f7f8fa]"
                            aria-label="Aumentar quantidade"
                            onClick={() =>
                              updateQty(item.productId, item.quantity + 1, item.variantId)
                            }
                          >
                            <PlusIcon />
                          </button>
                        </div>
                        <strong className="text-sm">
                          {money(item.price * item.quantity)}
                        </strong>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-line p-4">
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <strong className="text-base">{money(subtotal)}</strong>
          </div>
          {items.length > 0 ? (
            <>
              <Link
                href={checkoutHref}
                className="btn btn-accent btn-block py-2.5"
                onClick={() => setOpen(false)}
              >
                Finalizar compra
              </Link>
              <p className="mt-2 text-center text-[11px] text-muted">
                Frete e prazo calculados no checkout
              </p>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(false)}>
              Continuar comprando
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
