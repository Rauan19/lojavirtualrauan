import { SellerDocType } from '@prisma/client';

/*
 * Políticas padrão da vitrine.
 *
 * Antes, loja nova nascia com termos, privacidade e trocas vazios — e podia
 * ir ao ar assim. O Decreto 7.962/2013 exige que essas informações estejam
 * disponíveis, e a LGPD exige a política de privacidade: sem elas o lojista
 * está irregular desde a primeira venda, sem ter feito nada de errado.
 *
 * O texto é montado com os dados que o lojista já cadastrou e descreve o que
 * a plataforma realmente faz. Nada aqui promete prazo que não controlamos —
 * o prazo de entrega vem da cotação no checkout, e o de reembolso depende do
 * provedor de pagamento.
 *
 * O lojista pode escrever a própria versão no admin; a dele sempre vence.
 */

export type PolicyStore = {
  name: string;
  sellerLegalName: string | null;
  sellerDocType: SellerDocType | null;
  sellerDocument: string | null;
  sellerStreet: string | null;
  sellerNumber: string | null;
  sellerNeighborhood: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  sellerZipCode: string | null;
  sellerEmail: string | null;
  sellerPhone: string | null;
};

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatCnpj(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCep(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 8) return raw;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** Bloco de identificação do vendedor, exigido pelo Decreto 7.962 art. 2º. */
function identificacao(store: PolicyStore) {
  const nome = store.sellerLegalName?.trim() || store.name;
  const linhas: string[] = [`<strong>${esc(nome)}</strong>`];

  // CPF é dado pessoal do lojista: só o documento de empresa vai para a
  // vitrine, mesma regra do rodapé.
  if (store.sellerDocType === SellerDocType.CNPJ && store.sellerDocument) {
    linhas.push(`CNPJ ${esc(formatCnpj(store.sellerDocument))}`);
  }

  const rua = [store.sellerStreet, store.sellerNumber]
    .filter(Boolean)
    .join(', ');
  const endereco = [rua, store.sellerNeighborhood]
    .filter(Boolean)
    .join(' — ');
  const cidade = [store.sellerCity, store.sellerState].filter(Boolean).join('/');
  const local = [endereco, cidade].filter(Boolean).join(', ');
  const comCep = store.sellerZipCode
    ? `${local}${local ? ' · ' : ''}CEP ${formatCep(store.sellerZipCode)}`
    : local;
  if (comCep) linhas.push(esc(comCep));

  const contato: string[] = [];
  if (store.sellerEmail) contato.push(esc(store.sellerEmail));
  if (store.sellerPhone) contato.push(esc(formatPhone(store.sellerPhone)));
  if (contato.length) linhas.push(contato.join(' · '));

  return `<p>${linhas.join('<br />')}</p>`;
}

function termos(store: PolicyStore) {
  const nome = esc(store.name);
  return `
<p>Estas condições valem para as compras feitas na loja ${nome}. Ao finalizar
um pedido, você declara ter lido e concordado com elas.</p>

<h3>Quem vende</h3>
${identificacao(store)}

<h3>Produtos, preços e disponibilidade</h3>
<p>As características de cada produto estão na própria página dele. Preços e
disponibilidade podem mudar a qualquer momento, mas o preço válido é sempre o
que aparece no momento em que você fecha o pedido.</p>
<p>Se um produto ficar indisponível depois da compra, o pedido é cancelado e o
valor pago é devolvido integralmente.</p>

<h3>Pagamento</h3>
<p>O pagamento é processado pelo provedor contratado pela loja. Compras
parceladas com juros mostram, antes da confirmação, o valor de cada parcela e
o total a prazo.</p>

<h3>Entrega</h3>
<p>O prazo e o valor do frete são calculados pelo seu CEP durante o checkout e
aparecem antes de você confirmar o pedido. O prazo começa a contar da
aprovação do pagamento.</p>

<h3>Direito de arrependimento</h3>
<p>Você pode desistir da compra em até <strong>7 dias corridos</strong> a
contar do recebimento do produto, sem precisar justificar, conforme o artigo
49 do Código de Defesa do Consumidor. Nesse caso o valor pago é devolvido
integralmente, incluindo o frete.</p>

<h3>Garantia</h3>
<p>Produtos com defeito têm garantia legal de 30 dias para bens não duráveis e
90 dias para bens duráveis, contados do recebimento, conforme o artigo 26 do
Código de Defesa do Consumidor, além da garantia do fabricante quando houver.</p>

<h3>Atendimento</h3>
<p>Acompanhe seus pedidos em <em>Minha conta</em>. Para falar com a loja, use
os contatos informados acima.</p>
`.trim();
}

function privacidade(store: PolicyStore) {
  const nome = esc(store.name);
  return `
<p>Esta política explica como a loja ${nome} trata os seus dados pessoais,
conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

<h3>Quem é o controlador</h3>
${identificacao(store)}

<h3>Que dados coletamos</h3>
<p>Nome, e-mail, telefone, CPF e endereço de entrega, informados por você no
cadastro e no checkout; e os dados dos seus pedidos, como itens, valores e
histórico de entrega.</p>
<p>Os dados do seu cartão são digitados diretamente no ambiente do provedor de
pagamento e <strong>não passam nem ficam guardados nesta loja</strong>.</p>

<h3>Para que usamos</h3>
<p>Para processar e entregar seus pedidos, emitir nota fiscal, prestar
atendimento e cumprir obrigações legais e fiscais. A base legal é a execução
do contrato de compra e o cumprimento de obrigação legal.</p>

<h3>Com quem compartilhamos</h3>
<p>Apenas com quem é necessário para a compra acontecer: o provedor de
pagamento, a transportadora escolhida no checkout, o emissor da nota fiscal e
a plataforma que hospeda a loja. Não vendemos seus dados nem os
compartilhamos para publicidade de terceiros.</p>

<h3>Por quanto tempo guardamos</h3>
<p>Pelo tempo necessário à finalidade e aos prazos legais — dados de compra e
nota fiscal ficam guardados pelo prazo exigido pela legislação fiscal.</p>

<h3>Seus direitos</h3>
<p>Você pode pedir confirmação do tratamento, acesso, correção, portabilidade,
anonimização ou exclusão dos seus dados, além de revogar consentimento,
conforme o artigo 18 da LGPD. Para exercer qualquer um deles, fale com a loja
pelos contatos informados acima.</p>
<p>A exclusão não alcança os dados que a loja é obrigada a guardar por lei,
como os das notas fiscais emitidas.</p>
`.trim();
}

function trocas(store: PolicyStore) {
  const nome = esc(store.name);
  return `
<p>Como pedir troca, devolução ou reembolso na loja ${nome}.</p>

<h3>Desistiu da compra (arrependimento)</h3>
<p>Você tem <strong>7 dias corridos</strong> a partir do recebimento para
desistir, sem precisar dar motivo (artigo 49 do Código de Defesa do
Consumidor). O produto deve voltar sem sinais de uso, com todos os
acessórios e, quando houver, a embalagem original.</p>
<p>Nesse caso o valor pago é devolvido integralmente, incluindo o frete que
você pagou, e o <strong>custo do envio de volta é da loja</strong>.</p>

<h3>Produto com defeito</h3>
<p>A garantia legal é de 30 dias para bens não duráveis e 90 dias para bens
duráveis, contados do recebimento (artigo 26 do CDC). Identificado o defeito,
a loja tem até 30 dias para resolver; passado esse prazo, você escolhe entre
troca por outro produto, devolução do valor pago ou abatimento no preço
(artigo 18 do CDC).</p>

<h3>Produto errado ou danificado no transporte</h3>
<p>Avise a loja assim que receber, de preferência com fotos. A troca é feita
sem custo para você.</p>

<h3>Como solicitar</h3>
<p>Entre em <em>Minha conta &rsaquo; Meus pedidos</em>, abra o pedido e use a
opção de solicitar reembolso, ou fale com a loja pelos contatos da página de
atendimento. Você recebe a confirmação do pedido de devolução por e-mail.</p>

<h3>Quando o dinheiro volta</h3>
<p>Depois de aprovada a devolução, o estorno é enviado ao provedor de
pagamento. O prazo até o valor aparecer para você depende do meio usado na
compra — no cartão, costuma cair na fatura seguinte.</p>
`.trim();
}

/** Devolve o texto do lojista, ou o padrão quando ele não escreveu nada. */
export function comPadrao(doLojista: string | null, padrao: string) {
  const semTags = (doLojista || '').replace(/<[^>]*>/g, '').trim();
  return semTags ? (doLojista as string) : padrao;
}

export function defaultPolicies(store: PolicyStore) {
  return {
    terms: termos(store),
    privacy: privacidade(store),
    returns: trocas(store),
  };
}
