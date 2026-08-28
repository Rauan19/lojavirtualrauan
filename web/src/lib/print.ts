export type PrintResult = {
  ok: boolean;
  mode: string;
  message?: string;
  receipt: {
    orderNumber: string;
    storeName: string;
    html: string;
    lines: { text: string; align?: string; bold?: boolean }[];
  };
};

const PRINTED_KEY = 'admin_printed_order_ids';

export function getPrintedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PRINTED_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

export function markPrinted(orderId: string) {
  const ids = new Set(getPrintedIds());
  ids.add(orderId);
  localStorage.setItem(PRINTED_KEY, JSON.stringify([...ids].slice(-200)));
}

/**
 * Abre o recibo em uma aba e dispara a impressão.
 * Usa Blob URL (não noopener + document.write) — evita aba em branco / conteúdo errado.
 */
export function openBrowserPrint(html: string) {
  const content = html?.trim();
  if (!content) {
    throw new Error('Recibo vazio — tente imprimir de novo');
  }

  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  // Sem noopener: precisamos acessar a janela para focar/imprimir
  const win = window.open(url, '_blank', 'width=420,height=640');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Permita pop-ups neste site para imprimir o pedido');
  }

  let printed = false;
  const tryPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      /* usuário pode usar Ctrl+P na aba do recibo */
    }
  };

  win.addEventListener('load', () => {
    setTimeout(tryPrint, 150);
  });
  // Fallback se o evento load já passou / não disparar
  setTimeout(tryPrint, 600);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function printOrderResult(result: PrintResult) {
  // Rede: API já mandou ESC/POS direto pra térmica — não abre navegador
  if (result.mode === 'NETWORK') return;
  const html = result.receipt?.html;
  if (!html) {
    throw new Error('Servidor não retornou o recibo para impressão');
  }
  openBrowserPrint(html);
}
