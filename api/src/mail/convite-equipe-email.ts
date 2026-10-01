function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ConviteEquipeEmailInput = {
  storeName: string;
  nome: string;
  quemConvidou: string;
  /** Nomes das áreas liberadas ("Pedidos e reembolsos", ...) */
  areas: string[];
  link: string;
};

/**
 * Convite para a equipe da loja: a pessoa cria a própria senha pelo link.
 * O dono nunca escolhe nem vê a senha de ninguém.
 */
export function buildConviteEquipeEmail(input: ConviteEquipeEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const loja = input.storeName.trim() || 'a loja';
  const primeiroNome = input.nome.trim().split(/\s+/)[0] || '';
  const subject = `Você foi chamado para a equipe · ${loja}`;
  const link = escapeHtml(input.link);

  const text = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}!`,
    '',
    `${input.quemConvidou} chamou você para ajudar no painel de ${loja}.`,
    '',
    'Você vai cuidar de:',
    ...input.areas.map((a) => `• ${a}`),
    '',
    'Crie sua senha pelo link abaixo (vale por 7 dias):',
    input.link,
    '',
    'Se você não esperava este convite, pode ignorar este e-mail.',
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
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">${escapeHtml(loja)}</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">Você foi chamado para a equipe</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3f3f46;">
                Olá${primeiroNome ? `, ${escapeHtml(primeiroNome)}` : ''}! <strong style="color:#111">${escapeHtml(input.quemConvidou)}</strong> chamou você para ajudar no painel de <strong style="color:#111">${escapeHtml(loja)}</strong>. Você vai cuidar de:
              </p>
              <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.7;color:#3f3f46;">
                ${input.areas.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
              </ul>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 16px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:#111111;">
                    <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Criar minha senha</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                O link vale por 7 dias. Se você não esperava este convite, pode ignorar este e-mail.
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
