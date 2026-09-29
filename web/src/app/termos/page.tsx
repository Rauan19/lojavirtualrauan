import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { LEGAL, TERMS_VERSION, empresaIdentificada } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: `Contrato de uso da plataforma ${LEGAL.marca} para lojistas.`,
  alternates: { canonical: '/termos' },
};

/*
 * Texto-base escrito para ser revisado por advogado antes de valer em
 * produção. Ao mudar algo relevante, troque TERMS_VERSION (web/src/lib/legal.ts
 * e api/src/common/legal.ts): o aceite de cada loja grava a versão.
 */
export default function TermosPage() {
  const foro = LEGAL.cidadeForo || 'da sede da empresa';
  return (
    <LegalPage
      titulo="Termos de Uso"
      versao={TERMS_VERSION}
      resumo={
        <>
          <p>
            <strong>Em resumo:</strong> a {LEGAL.marca} fornece o sistema para você montar e operar a
            sua loja online. <strong>Quem vende é você</strong>: produtos, preços, entrega, trocas,
            nota fiscal e atendimento ao cliente são responsabilidade da loja. O dinheiro das vendas
            cai direto na sua conta do Mercado Pago. Você paga uma mensalidade, pode cancelar quando
            quiser pelo painel e leva os seus dados com você.
          </p>
        </>
      }
    >
      <section>
        <h2>1. Quem somos e o que estes termos cobrem</h2>
        <p>
          A {LEGAL.marca} é uma plataforma de software, oferecida por {empresaIdentificada()}
          {LEGAL.endereco ? `, com sede em ${LEGAL.endereco}` : ''}, que permite a empresas e
          pessoas (“<strong>lojista</strong>”) criar e administrar lojas virtuais com marca própria.
        </p>
        <p>
          Estes termos são o contrato entre a {LEGAL.marca} e o lojista. Ao criar uma loja e marcar
          que leu e aceita, você concorda com eles e com a{' '}
          <Link href="/privacidade" className="underline">
            Política de Privacidade
          </Link>
          . Se estiver cadastrando uma empresa, declara ter poderes para representá-la.
        </p>
      </section>

      <section>
        <h2>2. Cadastro e acesso</h2>
        <ul>
          <li>Você precisa ter 18 anos ou mais e informar dados verdadeiros e atualizados, incluindo CPF ou CNPJ e endereço.</li>
          <li>O login e a senha são pessoais. Você responde pelo que for feito com o seu acesso e deve nos avisar se suspeitar de uso indevido.</li>
          <li>Podemos recusar ou cancelar cadastros com dados falsos ou usados para fraude.</li>
        </ul>
      </section>

      <section>
        <h2>3. Teste grátis, planos e pagamento</h2>
        <ul>
          <li>A loja começa em período de teste gratuito, com a duração informada no cadastro. Depois dele, passa a ser cobrada a mensalidade do plano escolhido.</li>
          <li>A cobrança é mensal, por cartão (recorrente) ou Pix, pelo Mercado Pago. Emitimos nota fiscal de serviço das mensalidades.</li>
          <li>Os preços podem ser reajustados com aviso de pelo menos 30 dias por e-mail ou no painel. Se não concordar, você pode cancelar antes do reajuste valer.</li>
          <li>Na primeira contratação, você pode desistir em até 7 dias depois da primeira cobrança e receber de volta o valor pago.</li>
        </ul>
      </section>

      <section>
        <h2>4. Atraso, suspensão e cancelamento</h2>
        <ul>
          <li>Com a mensalidade em atraso, o painel fica em modo somente leitura até o pagamento, mas a vitrine continua vendendo.</li>
          <li>Se o atraso continuar, a loja pode ser suspensa: a vitrine sai do ar até a regularização.</li>
          <li>Você pode cancelar a qualquer momento pelo painel, sem multa. O acesso continua até o fim do período já pago; não há devolução proporcional de mês em curso, fora o caso do item 3.</li>
          <li>Podemos suspender ou encerrar lojas que violem estes termos, especialmente o item 6, avisando o motivo sempre que a lei permitir.</li>
        </ul>
      </section>

      <section>
        <h2>5. Responsabilidades do lojista</h2>
        <p>
          O lojista é o <strong>fornecedor</strong> perante os seus clientes, nos termos do Código
          de Defesa do Consumidor, e responde por:
        </p>
        <ul>
          <li>produtos anunciados, descrição, fotos, preço, estoque, qualidade e garantia;</li>
          <li>entrega, prazos, trocas, devoluções e o direito de arrependimento de 7 dias do consumidor;</li>
          <li>emissão de nota fiscal das vendas e cumprimento das obrigações fiscais da loja;</li>
          <li>atendimento aos clientes e às solicitações deles sobre dados pessoais;</li>
          <li>ter os direitos sobre marcas, textos e fotos que publicar;</li>
          <li>as contas que conecta à loja (Mercado Pago, Melhor Envio, emissor de nota fiscal e outras), incluindo taxas cobradas por esses serviços.</li>
        </ul>
        <p>
          A {LEGAL.marca} não é parte das vendas feitas na loja, não recebe o dinheiro delas e não
          escolhe os produtos vendidos.
        </p>
      </section>

      <section>
        <h2>6. O que não é permitido</h2>
        <p>É proibido usar a plataforma para:</p>
        <ul>
          <li>vender produtos falsificados, pirateados ou que violem marca ou direito autoral de outra pessoa;</li>
          <li>vender produtos proibidos ou que dependam de autorização que a loja não tem, como medicamentos, armas e munições, drogas, animais silvestres e produtos de origem ilegal;</li>
          <li>aplicar golpes, cobrar sem entregar, usar dados de cartão ou identidade de terceiros;</li>
          <li>enviar spam, invadir ou sobrecarregar o sistema, ou tentar acessar dados de outras lojas;</li>
          <li>publicar conteúdo ilegal, discriminatório ou que incentive violência.</li>
        </ul>
        <p>
          Recebendo denúncia fundamentada ou ordem judicial, podemos retirar anúncios ou suspender
          a loja. Denúncias podem ser enviadas para{' '}
          {LEGAL.emailContato ? <strong>{LEGAL.emailContato}</strong> : 'o nosso contato'}.
        </p>
      </section>

      <section>
        <h2>7. O que a {LEGAL.marca} oferece</h2>
        <ul>
          <li>O software da loja, a hospedagem, as atualizações e o suporte pelos canais informados no site.</li>
          <li>Trabalhamos para manter a plataforma no ar e com cópias de segurança, mas não garantimos funcionamento sem nenhuma interrupção. Manutenções programadas serão avisadas quando possível.</li>
          <li>Não garantimos volume de vendas nem resultado comercial.</li>
          <li>Recursos podem ser melhorados, trocados ou removidos. Mudança que tire algo essencial do seu plano será avisada com antecedência.</li>
        </ul>
      </section>

      <section>
        <h2>8. Serviços de terceiros</h2>
        <p>
          Pagamentos, frete e emissão de notas fiscais são prestados por empresas parceiras
          (como Mercado Pago, Melhor Envio e Focus NFe), com contas em nome do próprio lojista e
          sujeitos aos termos e taxas dessas empresas. A {LEGAL.marca} não responde por falhas,
          bloqueios ou cobranças feitas por esses serviços.
        </p>
      </section>

      <section>
        <h2>9. Dados pessoais dos clientes da loja</h2>
        <p>
          Nos dados dos clientes das lojas, o <strong>lojista é o controlador</strong> e a{' '}
          {LEGAL.marca} é <strong>operadora</strong>, nos termos da Lei Geral de Proteção de Dados
          (Lei 13.709/2018). Como operadora, a {LEGAL.marca} se compromete a:
        </p>
        <ul>
          <li>tratar esses dados apenas para prestar o serviço contratado e conforme as instruções do lojista;</li>
          <li>manter medidas de segurança e confidencialidade adequadas;</li>
          <li>usar apenas fornecedores (suboperadores) necessários ao serviço, listados na Política de Privacidade;</li>
          <li>ajudar o lojista a atender pedidos dos titulares, como acesso, correção e exclusão;</li>
          <li>avisar o lojista sem demora sobre incidente de segurança que afete dados da loja;</li>
          <li>excluir ou devolver os dados ao fim do contrato, salvo o que a lei obrigue a guardar.</li>
        </ul>
        <p>
          O lojista deve ter base legal para os dados que coleta, manter a política de privacidade
          da loja atualizada e atender os titulares.
        </p>
      </section>

      <section>
        <h2>10. Propriedade intelectual</h2>
        <p>
          O software, a marca {LEGAL.marca} e o layout da plataforma pertencem à {LEGAL.marca}.
          O conteúdo da loja (produtos, textos, fotos e marca da loja) continua sendo do lojista,
          que nos autoriza a armazená-lo e exibi-lo apenas para fazer a loja funcionar.
        </p>
      </section>

      <section>
        <h2>11. Limite de responsabilidade</h2>
        <p>
          Na medida permitida pela lei, a {LEGAL.marca} não responde por lucros que deixaram de
          ser obtidos, perda de vendas ou danos indiretos, e a responsabilidade total por qualquer
          reclamação fica limitada ao valor das mensalidades pagas pelo lojista nos 12 meses
          anteriores ao fato. Esse limite não se aplica a casos de dolo ou culpa grave, nem onde a
          lei proíba limitar.
        </p>
      </section>

      <section>
        <h2>12. Saída da plataforma e seus dados</h2>
        <p>
          Depois do cancelamento, você tem 30 dias para pedir a exportação dos dados da loja
          (produtos, clientes e pedidos). Passado esse prazo, os dados são excluídos, exceto o que
          precisarmos guardar por obrigação legal, como registros fiscais e de acesso.
        </p>
      </section>

      <section>
        <h2>13. Mudanças nestes termos</h2>
        <p>
          Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou no
          painel com pelo menos 15 dias de antecedência. Continuar usando a plataforma depois disso
          significa concordar com a nova versão; se não concordar, você pode cancelar sem multa.
        </p>
      </section>

      <section>
        <h2>14. Lei aplicável e foro</h2>
        <p>
          Estes termos seguem a lei brasileira. Fica eleito o foro da comarca {foro} para resolver
          conflitos, ressalvado o direito do lojista que seja consumidor de propor ação no próprio
          domicílio.
        </p>
      </section>

      <section>
        <h2>15. Contato</h2>
        <p>
          Dúvidas sobre estes termos:{' '}
          {LEGAL.emailContato ? <strong>{LEGAL.emailContato}</strong> : 'pelos canais informados no site'}.
        </p>
      </section>
    </LegalPage>
  );
}
