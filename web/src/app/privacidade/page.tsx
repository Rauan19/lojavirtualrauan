import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { LEGAL, PRIVACY_VERSION, empresaIdentificada } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: `Como a ${LEGAL.marca} trata dados pessoais de lojistas, visitantes e clientes das lojas.`,
  alternates: { canonical: '/privacidade' },
};

/*
 * Texto-base para revisão por advogado. Os prazos e fornecedores abaixo
 * refletem o sistema: registros de acesso por 180 dias
 * (api/src/common/access-log.service.ts), tokens cifrados com AES-256-GCM
 * (api/src/common/utils/secret-crypto.ts), senhas em bcrypt. Se isso mudar
 * no código, mude aqui e troque PRIVACY_VERSION.
 */
export default function PrivacidadePage() {
  const contato = LEGAL.emailPrivacidade;
  return (
    <LegalPage
      titulo="Política de Privacidade"
      versao={PRIVACY_VERSION}
      resumo={
        <p>
          <strong>Em resumo:</strong> usamos os seus dados para fazer a sua loja funcionar, cobrar a
          mensalidade e cumprir a lei. Não vendemos dados. Nos dados dos clientes das lojas, quem
          decide é o lojista; nós só processamos para o sistema funcionar. Você pode pedir acesso,
          correção ou exclusão pelo e-mail {contato ? <strong>{contato}</strong> : 'de contato do site'}.
        </p>
      }
    >
      <section>
        <h2>1. Quem é o responsável</h2>
        <p>
          {empresaIdentificada()}
          {LEGAL.endereco ? `, com sede em ${LEGAL.endereco}` : ''} (“{LEGAL.marca}”) é a
          controladora dos dados pessoais de lojistas e visitantes do site da {LEGAL.marca}, nos
          termos da Lei Geral de Proteção de Dados (Lei 13.709/2018, “LGPD”).
        </p>
        <p>
          <strong>Encarregado pelo tratamento de dados (LGPD art. 41):</strong>{' '}
          {contato ? contato : 'contato informado no site'}.
        </p>
      </section>

      <section>
        <h2>2. Nossos dois papéis</h2>
        <ul>
          <li>
            <strong>Dados de lojistas e visitantes do nosso site:</strong> a {LEGAL.marca} é
            controladora e decide como esses dados são usados, conforme esta política.
          </li>
          <li>
            <strong>Dados dos clientes das lojas</strong> (quem compra numa loja criada na
            plataforma): o lojista é o controlador e a {LEGAL.marca} é operadora. Tratamos esses
            dados só para o sistema da loja funcionar, conforme as instruções do lojista e os{' '}
            <Link href="/termos" className="underline">
              Termos de Uso
            </Link>
            . Cada loja tem a sua própria política de privacidade, e pedidos sobre esses dados
            devem ser feitos à loja. O próprio cliente também pode baixar ou excluir os seus dados
            em “Minha conta”, na loja.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Dados que tratamos dos lojistas</h2>
        <ul>
          <li><strong>Cadastro:</strong> nome, e-mail, telefone, CPF ou CNPJ, razão social e endereço.</li>
          <li><strong>Pagamento da mensalidade:</strong> feito pelo Mercado Pago. Não guardamos número de cartão; recebemos apenas o status e a identificação do pagamento.</li>
          <li><strong>Integrações:</strong> chaves de acesso ao Mercado Pago, Melhor Envio e emissor de nota fiscal, guardadas cifradas.</li>
          <li><strong>Registros de acesso:</strong> endereço IP, data e hora de uso, que a lei nos obriga a guardar (Marco Civil da Internet, art. 15).</li>
          <li><strong>Registro do aceite:</strong> versão dos termos, data e IP no momento do cadastro.</li>
          <li><strong>Atendimento:</strong> mensagens trocadas com o suporte.</li>
        </ul>
      </section>

      <section>
        <h2>4. Para que usamos e com qual base legal</h2>
        <ul>
          <li><strong>Prestar o serviço</strong> (criar e manter a loja, suporte, avisos sobre a conta): execução do contrato.</li>
          <li><strong>Cobrar a mensalidade e emitir nota fiscal:</strong> execução do contrato e obrigação legal.</li>
          <li><strong>Guardar registros de acesso e dados fiscais:</strong> obrigação legal.</li>
          <li><strong>Segurança, prevenção a fraude e melhoria do sistema:</strong> legítimo interesse, sempre limitado ao necessário.</li>
          <li><strong>Enviar novidades e ofertas:</strong> apenas com o seu consentimento, que pode ser retirado a qualquer momento.</li>
        </ul>
      </section>

      <section>
        <h2>5. Com quem compartilhamos</h2>
        <p>Não vendemos dados. Compartilhamos apenas com fornecedores necessários ao serviço:</p>
        <ul>
          <li><strong>Hospedagem:</strong> servidores contratados na Hostinger, onde ficam o sistema e o banco de dados.</li>
          <li><strong>Pagamentos:</strong> Mercado Pago.</li>
          <li><strong>Frete:</strong> Melhor Envio, quando a loja conecta a conta.</li>
          <li><strong>Notas fiscais:</strong> Focus NFe, quando a loja ativa a emissão.</li>
          <li><strong>E-mails automáticos:</strong> o provedor de e-mail usado para enviar confirmações e recuperação de senha.</li>
          <li><strong>Monitoramento de erros:</strong> Sentry, que recebe informações técnicas de falhas do sistema.</li>
          <li><strong>Autoridades:</strong> quando houver ordem judicial ou obrigação legal.</li>
        </ul>
      </section>

      <section>
        <h2>6. Transferência para fora do Brasil</h2>
        <p>
          Alguns fornecedores, como o serviço de monitoramento de erros, processam dados em
          servidores fora do Brasil, principalmente nos Estados Unidos. Nesses casos, usamos
          fornecedores que oferecem garantias de proteção compatíveis com a LGPD (art. 33).
        </p>
      </section>

      <section>
        <h2>7. Por quanto tempo guardamos</h2>
        <ul>
          <li><strong>Dados da conta:</strong> enquanto a loja estiver ativa e por 30 dias após o cancelamento, para permitir a exportação.</li>
          <li><strong>Registros de acesso:</strong> 6 meses, como exige o Marco Civil da Internet. Depois são apagados automaticamente.</li>
          <li><strong>Dados fiscais e de cobrança:</strong> pelo prazo exigido pela legislação tributária, em geral 5 anos.</li>
        </ul>
        <p>Passados esses prazos, os dados são excluídos ou anonimizados.</p>
      </section>

      <section>
        <h2>8. Segurança</h2>
        <ul>
          <li>Conexão protegida por HTTPS.</li>
          <li>Senhas guardadas com hash (bcrypt), nunca em texto.</li>
          <li>Chaves de pagamento, frete e nota fiscal cifradas no banco (AES-256).</li>
          <li>Acesso ao banco restrito e cópias de segurança periódicas.</li>
        </ul>
        <p>
          Se ocorrer um incidente de segurança que possa causar risco ou dano relevante, vamos
          comunicar a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas no
          prazo previsto na regulamentação.
        </p>
      </section>

      <section>
        <h2>9. Seus direitos</h2>
        <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos ou desatualizados;</li>
          <li>anonimização, bloqueio ou exclusão de dados desnecessários;</li>
          <li>portabilidade dos dados;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>revogação do consentimento, quando o uso depender dele.</li>
        </ul>
        <p>
          Envie o pedido para {contato ? <strong>{contato}</strong> : 'o contato do site'}.
          Respondemos em até 15 dias. Você também pode reclamar à ANPD.
        </p>
      </section>

      <section>
        <h2>10. Cookies e armazenamento no navegador</h2>
        <p>
          O painel da {LEGAL.marca} usa apenas armazenamento essencial do navegador, para manter
          você conectado e lembrar o carrinho. Não usamos cookies de publicidade no nosso site.
          As lojas podem usar ferramentas de medição, como Google Analytics e Meta Pixel, que só
          são carregadas depois que o visitante aceita no aviso de cookies da loja.
        </p>
      </section>

      <section>
        <h2>11. Menores de idade</h2>
        <p>
          A plataforma é destinada a lojistas maiores de 18 anos. Não coletamos intencionalmente
          dados de crianças.
        </p>
      </section>

      <section>
        <h2>12. Mudanças nesta política</h2>
        <p>
          Podemos atualizar esta política. A versão em vigor fica sempre nesta página, com a data
          no topo. Mudanças relevantes serão avisadas por e-mail ou no painel.
        </p>
      </section>
    </LegalPage>
  );
}
