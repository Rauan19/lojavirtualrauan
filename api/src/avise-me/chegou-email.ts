function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Chegou!": o produto que o cliente pediu para avisar voltou ao estoque. */
export function buildChegouEmail(input: {
  storeName: string;
  produto: string;
  preco: number;
  link: string;
  imagem?: string | null;
  accentColor?: string;
}): { subject: string; text: string; html: string } {
  const loja = input.storeName.trim() || 'a loja';
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor || '')
    ? (input.accentColor as string)
    : '#111111';
  const preco = input.preco.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const subject = `Chegou! ${input.produto} voltou · ${loja}`;
  const text = [
    'Olá!',
    '',
    `Você pediu para avisar: ${input.produto} voltou ao estoque em ${loja}, por ${preco}.`,
    '',
    `Garanta o seu: ${input.link}`,
    '',
    'O estoque pode acabar de novo. Este é o único aviso deste produto.',
  ].join('\n');
  const img = input.imagem?.startsWith('https://')
    ? `<img src="${escapeHtml(input.imagem)}" alt="" width="200" style="display:block;margin:0 auto 16px;max-width:200px;border-radius:8px;" />`
    : '';
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
        <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">${escapeHtml(loja)}</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">Chegou o que você esperava</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 24px;text-align:center;">
          ${img}
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#09090b;">${escapeHtml(input.produto)}</p>
          <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;">${preco}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
            <tr><td align="center" style="border-radius:8px;background:${accent};">
              <a href="${escapeHtml(input.link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Garantir o meu</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#a1a1aa;">O estoque pode acabar de novo. Este é o único aviso deste produto.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}
