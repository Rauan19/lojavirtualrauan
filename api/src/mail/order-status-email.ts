function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export type OrderEmailItem = {
  productName: string;
  variantLabel?: string | null;
  quantity: number;
  total: number;
};

export type OrderEmailInput = {
  /** `received` = pedido criado; `paid` = pagamento confirmado. */
  kind: 'received' | 'paid';
  storeName: string;
  customerName?: string | null;
  orderNumber: string;
  items: OrderEmailItem[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  orderUrl: string;
  accentColor?: string;
  /** Só em `received`: instrução de pagamento pendente (Pix/boleto). */
  paymentHint?: string | null;
};

/**
 * Confirmação de pedido e de pagamento.
 *
 * Sem esses dois e-mails o cliente paga e não recebe prova nenhuma da compra,
 * o que vira chamado de suporte e contestação no cartão.
 */
export function buildOrderEmail(input: OrderEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const paid = input.kind === 'paid';
  const storeRaw = input.storeName.trim() || 'Loja';
  const store = escapeHtml(storeRaw);
  const orderNo = escapeHtml(input.orderNumber);
  const orderUrl = escapeHtml(input.orderUrl);
  const hello = input.customerName?.trim()
    ? `Olá, ${input.customerName.trim()}`
    : 'Olá';
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor || '')
    ? (input.accentColor as string)
    : '#111111';

  const subject = paid
    ? `Pagamento aprovado · pedido ${input.orderNumber} · ${storeRaw}`
    : `Recebemos seu pedido ${input.orderNumber} · ${storeRaw}`;

  const headline = paid ? 'Pagamento aprovado!' : 'Recebemos seu pedido!';

  const lead = paid
    ? `Seu pagamento do pedido ${input.orderNumber} foi confirmado. Já estamos preparando o envio.`
    : `Seu pedido ${input.orderNumber} foi registrado. Assim que o pagamento for confirmado, avisamos por aqui.`;

  const itemLines = input.items.map(
    (item) =>
      `${item.quantity}x ${item.productName}${
        item.variantLabel ? ` (${item.variantLabel})` : ''
      } — ${money(item.total)}`,
  );

  const text = [
    `${hello}!`,
    '',
    lead,
    '',
    'Itens:',
    ...itemLines,
    '',
    `Subtotal: ${money(input.subtotal)}`,
    input.discount > 0 ? `Desconto: -${money(input.discount)}` : '',
    `Frete: ${input.shippingCost > 0 ? money(input.shippingCost) : 'Grátis'}`,
    `Total: ${money(input.total)}`,
    '',
    input.paymentHint || '',
    '',
    'Acompanhe seu pedido:',
    input.orderUrl,
    '',
    storeRaw,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const itemsHtml = input.items
    .map(
      (item) => `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#333333;">
                  ${escapeHtml(String(item.quantity))}x ${escapeHtml(item.productName)}${
                    item.variantLabel
                      ? ` <span style="color:#777777;">(${escapeHtml(item.variantLabel)})</span>`
                      : ''
                  }
                </td>
                <td align="right" style="padding:8px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#333333;white-space:nowrap;">
                  ${escapeHtml(money(item.total))}
                </td>
              </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, bold = false) => `
              <tr>
                <td style="padding:4px 0;font-size:${bold ? '15px' : '14px'};color:${bold ? '#111111' : '#666666'};${bold ? 'font-weight:bold;' : ''}">${label}</td>
                <td align="right" style="padding:4px 0;font-size:${bold ? '15px' : '14px'};color:${bold ? '#111111' : '#666666'};${bold ? 'font-weight:bold;' : ''}white-space:nowrap;">${value}</td>
              </tr>`;

  const hintHtml = input.paymentHint
    ? `<p style="margin:0 0 16px;padding:12px;background:#fff8e1;border-radius:6px;font-size:14px;color:#5f4300;">
                ${escapeHtml(input.paymentHint)}
              </p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:${accent};color:#ffffff;font-size:16px;font-weight:bold;">
                ${store}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 8px;font-size:20px;color:#111111;">${headline}</h1>
                <p style="margin:0 0 16px;font-size:14px;color:#555555;">
                  ${escapeHtml(hello)}! ${escapeHtml(lead)}
                </p>
                ${hintHtml}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                  <tr>
                    <td colspan="2" style="padding-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#999999;">
                      Pedido ${orderNo}
                    </td>
                  </tr>
                  ${itemsHtml}
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  ${totalRow('Subtotal', escapeHtml(money(input.subtotal)))}
                  ${input.discount > 0 ? totalRow('Desconto', `-${escapeHtml(money(input.discount))}`) : ''}
                  ${totalRow('Frete', input.shippingCost > 0 ? escapeHtml(money(input.shippingCost)) : 'Grátis')}
                  ${totalRow('Total', escapeHtml(money(input.total)), true)}
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td style="border-radius:6px;background:${accent};">
                      <a href="${orderUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                        Ver meu pedido
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#fafafa;font-size:12px;color:#999999;text-align:center;">
                Você recebeu este e-mail porque fez um pedido em ${store}.
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
