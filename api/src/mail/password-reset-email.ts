function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type PasswordResetEmailInput = {
  storeName: string;
  resetUrl: string;
  /** Cliente da loja vs painel admin */
  audience: 'customer' | 'admin';
  accentColor?: string;
};

export function buildPasswordResetEmail(input: PasswordResetEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const name = escapeHtml(input.storeName.trim() || 'Loja');
  const url = input.resetUrl.trim();
  const safeUrl = escapeHtml(url);
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor || '')
    ? (input.accentColor as string)
    : '#111111';

  const isCustomer = input.audience === 'customer';
  const subject = isCustomer
    ? `Redefinir senha · ${input.storeName.trim() || 'sua conta'}`
    : 'Redefinir senha · painel';

  const headline = 'Redefinir sua senha';
  const intro = isCustomer
    ? `Recebemos um pedido para redefinir a senha da sua conta em <strong style="color:#111">${name}</strong>.`
    : `Recebemos um pedido para redefinir a senha do seu acesso ao painel <strong style="color:#111">${name}</strong>.`;

  const text = [
    headline,
    '',
    isCustomer
      ? `Recebemos um pedido para redefinir a senha da sua conta em ${input.storeName}.`
      : `Recebemos um pedido para redefinir a senha do painel (${input.storeName}).`,
    '',
    'Abra o link abaixo (válido por 1 hora):',
    url,
    '',
    'Se você não pediu isso, pode ignorar este e-mail com segurança.',
    'Ninguém altera sua senha sem este link.',
  ].join('\n');

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
                ${name}
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">
                ${headline}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3f3f46;">
                ${intro}
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#3f3f46;">
                Clique no botão abaixo. O link funciona por <strong>1 hora</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:${accent};">
                    <a href="${safeUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Criar nova senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#71717a;">
                Se o botão não funcionar, copie e cole este link no navegador:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="${safeUrl}" style="color:${accent};text-decoration:underline;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                Não foi você? Ignore este e-mail — sua senha continua a mesma.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:1.4;color:#a1a1aa;max-width:520px;">
          E-mail automático · não responda esta mensagem
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
