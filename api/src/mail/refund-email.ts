import { REGRAS, isRefundReason } from '../orders/refund-rules';

/*
 * E-mails do fluxo de reembolso.
 *
 * O de `requested` não é cortesia: o Decreto 7.962/2013 art. 5º, §1º exige
 * confirmação imediata do recebimento da manifestação de arrependimento. Sem
 * ele o cliente clica no botão e não fica com prova nenhuma.
 */

export type RefundMailKind =
  | 'requested'
  | 'return_pending'
  | 'done'
  | 'rejected';

export type RefundMailInput = {
  kind: RefundMailKind;
  storeName: string;
  customerName: string;
  orderNumber: string;
  reasonType: string | null;
  /** Motivo escrito pelo lojista ao recusar. */
  rejectReason?: string | null;
  orderUrl?: string | null;
  accentColor?: string;
};

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function corpo(input: RefundMailInput): { titulo: string; linhas: string[] } {
  const motivo = isRefundReason(input.reasonType)
    ? REGRAS[input.reasonType].label
    : null;

  switch (input.kind) {
    case 'requested':
      return {
        titulo: 'Recebemos seu pedido de reembolso',
        linhas: [
          `Registramos sua solicitação para o pedido #${input.orderNumber}${
            motivo ? ` — motivo: ${motivo}` : ''
          }.`,
          'A loja vai analisar e você recebe um novo aviso com o resultado.',
          'Guarde este e-mail: ele é o comprovante da data em que você fez o pedido.',
        ],
      };
    case 'return_pending':
      return {
        titulo: 'Devolução autorizada',
        linhas: [
          `A devolução do pedido #${input.orderNumber} foi autorizada.`,
          'O próximo passo é o produto voltar para a loja. Ele deve ir sem sinais de uso, com todos os acessórios e, quando houver, na embalagem original.',
          'Assim que a loja confirmar o recebimento, o estorno é enviado ao meio de pagamento usado na compra.',
          'A loja entra em contato com as instruções de envio.',
        ],
      };
    case 'done':
      return {
        titulo: 'Reembolso enviado',
        linhas: [
          `O estorno do pedido #${input.orderNumber} foi enviado ao meio de pagamento usado na compra.`,
          'O prazo até o valor aparecer para você depende da operadora — no cartão, costuma cair na fatura seguinte.',
        ],
      };
    case 'rejected':
      return {
        titulo: 'Seu pedido de reembolso não foi aceito',
        linhas: [
          `A loja analisou a solicitação do pedido #${input.orderNumber} e não pôde aceitá-la.`,
          input.rejectReason
            ? `Motivo informado pela loja: ${input.rejectReason}`
            : 'A loja não informou um motivo.',
          'Se você não concorda, responda a este e-mail ou fale com a loja pelos canais de atendimento.',
        ],
      };
  }
}

export function buildRefundEmail(input: RefundMailInput) {
  const { titulo, linhas } = corpo(input);
  const accent = input.accentColor || '#d43d54';
  const subject = `${titulo} · Pedido #${input.orderNumber}`;

  const text = [
    `Olá, ${input.customerName}.`,
    '',
    ...linhas,
    '',
    input.orderUrl ? `Acompanhe: ${input.orderUrl}` : '',
    '',
    input.storeName,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#171a1f">
  <h1 style="font-size:20px;margin:0 0 4px">${esc(titulo)}</h1>
  <p style="font-size:13px;color:#4a5560;margin:0 0 18px">Pedido #${esc(
    input.orderNumber,
  )} · ${esc(input.storeName)}</p>
  <p style="font-size:15px;margin:0 0 14px">Olá, ${esc(input.customerName)}.</p>
  ${linhas
    .map(
      (l) =>
        `<p style="font-size:14px;line-height:1.55;margin:0 0 12px;color:#39424e">${esc(
          l,
        )}</p>`,
    )
    .join('')}
  ${
    input.orderUrl
      ? `<p style="margin:22px 0 0"><a href="${esc(
          input.orderUrl,
        )}" style="display:inline-block;background:${esc(
          accent,
        )};color:#fff;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:bold">Ver meu pedido</a></p>`
      : ''
  }
</div>`.trim();

  return { subject, text, html };
}
