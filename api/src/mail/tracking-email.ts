function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolvePublicTrackingUrl(
  code?: string | null,
  customUrl?: string | null,
  shippingMethod?: string | null,
): string | null {
  if (customUrl?.trim()) return customUrl.trim();
  if (!code?.trim()) return null;
  const c = code.trim();
  const method = (shippingMethod || '').toLowerCase();
  if (method.includes('jadlog')) {
    return `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${encodeURIComponent(c)}`;
  }
  return `https://www.linkcorreios.com.br/?id=${encodeURIComponent(c)}`;
}

export type TrackingAvailableEmailInput = {
  storeName: string;
  customerName?: string | null;
  orderNumber: string;
  trackingCode: string;
  trackingUrl: string | null;
  ordersUrl: string;
  accentColor?: string;
};

export function buildTrackingAvailableEmail(
  input: TrackingAvailableEmailInput,
): { subject: string; text: string; html: string } {
  const store = escapeHtml(input.storeName.trim() || 'Loja');
  const orderNo = escapeHtml(input.orderNumber);
  const code = escapeHtml(input.trackingCode.trim());
  const trackUrl = input.trackingUrl?.trim() || null;
  const safeTrackUrl = trackUrl ? escapeHtml(trackUrl) : null;
  const ordersUrl = escapeHtml(input.ordersUrl);
  const hello = input.customerName?.trim()
    ? `Olá, ${escapeHtml(input.customerName.trim())}`
    : 'Olá';
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor || '')
    ? (input.accentColor as string)
    : '#111111';

  const subject = `Pedido ${input.orderNumber} enviado · ${input.storeName.trim() || 'sua loja'}`;

  const text = [
    `${hello}!`,
    '',
    `Seu pedido ${input.orderNumber} em ${input.storeName} foi enviado.`,
    '',
    `Código de rastreio: ${input.trackingCode.trim()}`,
    trackUrl ? `Rastrear: ${trackUrl}` : '',
    '',
    'Você também pode acompanhar o status em Minhas compras:',
    input.ordersUrl,
    '',
    'Qualquer dúvida, responda falando com a loja pelo site.',
  ]
    .filter(Boolean)
    .join('\n');

  const trackButton = safeTrackUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:${accent};">
                    <a href="${safeTrackUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Rastrear encomenda
                    </a>
                  </td>
                </tr>
              </table>`
    : '';

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
              <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">
                ${store}
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">
                Seu pedido foi enviado
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3f3f46;">
                ${hello}! O pedido <strong style="color:#111">#${orderNo}</strong> já saiu para entrega.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;">
                      Código de rastreio
                    </p>
                    <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.04em;color:#09090b;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
                      ${code}
                    </p>
                    ${
                      safeTrackUrl
                        ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.45;word-break:break-all;">
                      <a href="${safeTrackUrl}" style="color:${accent};text-decoration:underline;">${safeTrackUrl}</a>
                    </p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              ${trackButton}
              <p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#3f3f46;">
                Você também pode acompanhar o status (preparando, em trânsito, entregue) em
                <strong>Minhas compras</strong> na sua conta da loja.
              </p>
              <p style="margin:0 0 20px;">
                <a href="${ordersUrl}"
                   style="font-size:14px;font-weight:700;color:${accent};text-decoration:underline;">
                  Abrir Minhas compras
                </a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                Guarde este e-mail. O código acima é o que a transportadora usa para localizar o pacote.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:1.4;color:#a1a1aa;max-width:520px;">
          E-mail automático de ${store} · não responda esta mensagem
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
