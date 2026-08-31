/*
 * E-mails da mensalidade da plataforma.
 *
 * No cartão, o Mercado Pago cobra sozinho e o lojista não precisa fazer nada.
 * No Pix não existe débito automático: se ele não abrir o painel, não fica
 * sabendo que a cobrança do mês saiu — e a loja é suspensa por uma conta que
 * ele nem viu. O aviso é o que sustenta o fluxo Pix.
 *
 * Por isso o copia e cola vai dentro do e-mail: pagar não deve exigir login.
 */

export type BillingMailKind = 'pix_nova' | 'pix_vencendo' | 'paga';

export type BillingMailInput = {
  kind: BillingMailKind;
  brandName: string;
  storeName: string;
  planName: string;
  amount: number;
  /** Só no Pix. */
  copiaECola?: string | null;
  /** Até quando a cobrança pode ser paga. */
  expiresAt?: Date | null;
  /** Novo vencimento do plano, no e-mail de confirmação. */
  nextDueAt?: Date | null;
  /** Quando a loja é suspensa se não pagar. */
  suspendeEm?: Date | null;
  panelUrl?: string | null;
  accentColor?: string;
};

function esc(v: string) {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dinheiro(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function data(d?: Date | null) {
  if (!d) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function corpo(i: BillingMailInput) {
  const valor = dinheiro(i.amount);
  const ate = data(i.expiresAt);

  if (i.kind === 'paga') {
    const proximo = data(i.nextDueAt);
    return {
      titulo: 'Mensalidade confirmada',
      linhas: [
        `Recebemos o pagamento de ${valor} do plano ${i.planName}.`,
        proximo
          ? `Sua próxima cobrança é em ${proximo}.`
          : 'Sua loja segue ativa.',
      ],
    };
  }

  if (i.kind === 'pix_vencendo') {
    const corte = data(i.suspendeEm);
    return {
      titulo: 'Sua mensalidade está vencendo',
      linhas: [
        `A cobrança de ${valor} do plano ${i.planName} ainda não foi paga${
          ate ? ` e vence em ${ate}` : ''
        }.`,
        corte
          ? `Sem o pagamento, a loja sai do ar em ${corte}.`
          : 'Sem o pagamento, a loja é suspensa depois do prazo de carência.',
        'O código Pix abaixo continua válido.',
      ],
    };
  }

  return {
    titulo: 'Sua mensalidade está disponível',
    linhas: [
      `A cobrança de ${valor} do plano ${i.planName} já pode ser paga${
        ate ? `, até ${ate}` : ''
      }.`,
      'Pague pelo código Pix abaixo — assim que cair, sua loja renova por mais um mês.',
    ],
  };
}

export function buildBillingEmail(input: BillingMailInput) {
  const { titulo, linhas } = corpo(input);
  const accent = input.accentColor || '#d43d54';
  const subject = `${titulo} · ${input.brandName}`;
  const mostrarPix = Boolean(input.copiaECola) && input.kind !== 'paga';

  const text = [
    `Olá, ${input.storeName}.`,
    '',
    ...linhas,
    '',
    ...(mostrarPix
      ? ['Código Pix (copia e cola):', input.copiaECola as string, '']
      : []),
    ...(input.panelUrl ? [`Painel: ${input.panelUrl}`, ''] : []),
    input.brandName,
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#171a1f">
  <h1 style="font-size:20px;margin:0 0 4px">${esc(titulo)}</h1>
  <p style="font-size:13px;color:#4a5560;margin:0 0 18px">${esc(input.brandName)} · ${esc(input.storeName)}</p>

  ${linhas
    .map(
      (l) =>
        `<p style="font-size:14px;line-height:1.55;margin:0 0 12px;color:#39424e">${esc(l)}</p>`,
    )
    .join('')}

  ${
    mostrarPix
      ? `<div style="margin:20px 0;padding:14px;border:1px solid #e6e8ec;border-radius:10px;background:#fafafa">
    <p style="margin:0 0 6px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#6d6277">Código Pix (copia e cola)</p>
    <p style="margin:0;font-family:monospace;font-size:12px;line-height:1.5;word-break:break-all;color:#171a1f">${esc(
      input.copiaECola as string,
    )}</p>
  </div>`
      : ''
  }

  ${
    input.panelUrl
      ? `<p style="margin:22px 0 0"><a href="${esc(
          input.panelUrl,
        )}" style="display:inline-block;background:${esc(
          accent,
        )};color:#fff;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:bold">Abrir o painel</a></p>`
      : ''
  }
</div>`.trim();

  return { subject, text, html };
}
