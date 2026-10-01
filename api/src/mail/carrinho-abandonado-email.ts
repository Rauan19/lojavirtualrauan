function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type CarrinhoAbandonadoEmailInput = {
  storeName: string;
  customerName?: string | null;
  itens: { nome: string; quantidade: number; preco: number }[];
  total: number;
  linkRecuperar: string;
  accentColor?: string;
  /** "R$ 85,41 no Pix" quando a loja dá desconto */
  totalNoPix?: number | null;
};

/**
 * Lembrete de carrinho abandonado: o cliente chegou ao pagamento e não
 * pagou. Um e-mail só, com um botão que devolve os itens à sacola.
 */
export function buildCarrinhoAbandonadoEmail(
  input: CarrinhoAbandonadoEmailInput,
): {
  subject: string;
  text: string;
  html: string;
} {
  const loja = input.storeName.trim() || 'a loja';
  const store = escapeHtml(loja);
  const hello = input.customerName?.trim()
    ? `Olá, ${escapeHtml(input.customerName.trim().split(/\s+/)[0])}`
    : 'Olá';
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor || '')
    ? (input.accentColor as string)
    : '#111111';
  const link = escapeHtml(input.linkRecuperar);
  const itens = input.itens.slice(0, 5);
  const resto = input.itens.length - itens.length;

  const subject = `Você esqueceu itens na sacola · ${loja}`;

  const text = [
    `${input.customerName?.trim() ? `Olá, ${input.customerName.trim().split(/\s+/)[0]}` : 'Olá'}!`,
    '',
    `Seu pedido em ${loja} não foi pago e os itens voltaram para a loja. Separamos tudo de novo para você:`,
    '',
    ...input.itens.map(
      (i) => `• ${i.quantidade}x ${i.nome} — ${money(i.preco)}`,
    ),
    '',
    `Total: ${money(input.total)}`,
    input.totalNoPix ? `No Pix: ${money(input.totalNoPix)}` : '',
    '',
    `Finalizar a compra: ${input.linkRecuperar}`,
    '',
    'Este é o único lembrete deste pedido.',
  ]
    .filter((l) => l !== '')
    .join('\n');

  const linhas = itens
    .map(
      (i) => `<tr>
                  <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f0f0f2;">${i.quantidade}× ${escapeHtml(i.nome)}</td>
                  <td align="right" style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;border-bottom:1px solid #f0f0f2;white-space:nowrap;">${money(i.preco)}</td>
                </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">${store}</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">Você esqueceu itens na sacola</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3f3f46;">
                ${hello}! Seu pedido não foi pago e os itens voltaram para a loja. Separamos tudo de novo para você:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                ${linhas}
                ${resto > 0 ? `<tr><td colspan="2" style="padding:8px 0;font-size:13px;color:#71717a;">e mais ${resto} ${resto === 1 ? 'item' : 'itens'}</td></tr>` : ''}
                <tr>
                  <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:#09090b;">Total</td>
                  <td align="right" style="padding:12px 0 0;font-size:15px;font-weight:700;color:#09090b;">${money(input.total)}</td>
                </tr>
                ${
                  input.totalNoPix
                    ? `<tr><td colspan="2" align="right" style="padding:4px 0 0;font-size:13px;color:#1b7f45;font-weight:600;">${money(input.totalNoPix)} no Pix</td></tr>`
                    : ''
                }
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 16px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:${accent};">
                    <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Finalizar minha compra</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                Os preços e o estoque são conferidos de novo ao finalizar. Este é o único lembrete deste pedido.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
