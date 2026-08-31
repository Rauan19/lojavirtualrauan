import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { LandingCta } from '@/components/LandingCta';
import { SiteHeader } from '@/components/SiteHeader';
import { StoreDeviceShowcase } from '@/components/StoreDeviceShowcase';
import { BRAND } from '@/lib/brand';
import { CONTACT, whatsappHref } from '@/lib/contact';
import { getDemoStoreSlug, getPlans, siteUrl } from '@/lib/seo';

const faq: [string, string][] = [
  [
    'Preciso saber programar?',
    'Não. Você cadastra produto, define cor e logo, e a loja fica no ar. Quem cuida do resto é a gente.',
  ],
  [
    'Quando começo a pagar?',
    'Você cria a loja e testa sem pagar nada. Se não escolher um plano, o painel fica só de leitura até você assinar. A vitrine continua vendendo normalmente, e nada é cobrado sem sua confirmação.',
  ],
  [
    'Tem taxa por venda, além da mensalidade?',
    'A plataforma cobra só a mensalidade do plano. As taxas do processador de pagamento (como em qualquer venda com cartão ou Pix) são cobradas por ele, não por nós.',
  ],
  [
    'Posso usar o domínio da minha loja?',
    'Sim. Aponta o DNS pro nosso servidor e cadastra o domínio em Admin → Identidade. O registro do domínio (GoDaddy, Registro.br etc.) é por sua conta.',
  ],
  [
    'Como o dinheiro chega até mim?',
    'Direto na sua conta no processador de pagamento conectado à loja. O pagamento do cliente não passa pela gente.',
  ],
  [
    'Dá pra emitir nota fiscal?',
    'Sim, NFC-e integrada: emite direto do pedido quando o pagamento é aprovado.',
  ],
];

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function HomePage() {
  const wa = whatsappHref();
  const [plans, demoSlug] = await Promise.all([
    getPlans().then((list) => list || []),
    getDemoStoreSlug(),
  ]);
  const base = siteUrl();

  const orgId = `${base}/#organization`;

  /*
   * Quem e a empresa e qual e o site. E daqui que o Google tira nome, logo e
   * contato para ligar a marca aos resultados; antes existia so a ficha do
   * produto (SoftwareApplication), sem dono declarado.
   */
  const identityJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: BRAND.name,
        url: base,
        logo: {
          '@type': 'ImageObject',
          url: `${base}/brand/vendira-logo.webp`,
        },
        ...(CONTACT.email || CONTACT.whatsapp
          ? {
              contactPoint: [
                {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  areaServed: 'BR',
                  availableLanguage: 'Portuguese',
                  ...(CONTACT.email ? { email: CONTACT.email } : {}),
                  ...(CONTACT.whatsapp
                    ? { telephone: `+${CONTACT.whatsapp}` }
                    : {}),
                },
              ],
            }
          : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: BRAND.name,
        inLanguage: 'pt-BR',
        publisher: { '@id': orgId },
      },
    ],
  };

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    publisher: { '@id': orgId },
    name: BRAND.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: base,
    description:
      'Plataforma para criar loja virtual com catálogo, pedidos, pagamento por Pix e cartão, nota fiscal e domínio próprio.',
    offers: plans.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: plan.amount,
      priceCurrency: 'BRL',
    })),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return (
    <main className="landing min-h-screen bg-[#f7f8fa] text-ink">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(identityJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        // Conteúdo é JSON serializado por nós, não HTML de terceiro
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(orgJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <SiteHeader solid />

      {/*
        Hero sem o corte vertical duro que dividia a tela em dois blocos: agora
        é uma superfície só, com brilho difuso atrás dos aparelhos e a base
        arredondada apoiando na seção seguinte. Os aparelhos ganham inclinação
        em perspectiva, que é o que dá a sensação de profundidade.
      */}
      <section className="lp-hero relative overflow-hidden bg-[#f7f8fa]">
        <div className="lp-hero-glow" aria-hidden />
        <div className="relative mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-4 pb-14 pt-[4rem] md:flex-row md:gap-8 md:px-6 md:pb-20 md:pt-24 lg:gap-12">
          <div className="flex flex-1 flex-col justify-center md:max-w-[47%]">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#d9dde3] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#4a5560]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              Sua loja no ar hoje mesmo
            </span>
            <h1 className="max-w-[19ch] font-[family-name:var(--font-brand)] text-[2.2rem] font-800 leading-[1.04] tracking-tight text-[#171a1f] md:text-[3.05rem]">
              Sua loja virtual vende 24 horas por dia.{' '}
              <span style={{ color: 'var(--accent)' }}>Sem depender do seu atendimento.</span>
            </h1>
            <p className="mt-3.5 max-w-[38ch] text-[15px] leading-relaxed text-[#4a5560] md:mt-4 md:text-[16px]">
              Catálogo, checkout, Pix, cartão e frete calculado em uma
              plataforma só. O cliente escolhe e paga sozinho, a qualquer hora,
              e o valor cai direto na sua conta.
            </p>
            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <LandingCta href="/criar-conta" label="Criar minha loja grátis" />
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-[13px] font-semibold text-[#4a5560] underline-offset-4 hover:underline sm:text-left"
                >
                  Prefiro falar antes
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-[12px] font-medium text-[#4a5560]">
              Comece sem pagar nada · sem cartão de crédito
            </p>
          </div>

          <div className="lp-hero-devices w-full md:w-[53%]" aria-hidden>
            <StoreDeviceShowcase />
          </div>
        </div>
      </section>

      <section className="border-b border-[#d9dde3] bg-white">
        <div className="mx-auto max-w-[1080px] px-4 py-14 md:px-6 md:py-20">
          <h2 className="max-w-[20ch] font-[family-name:var(--font-brand)] text-[1.7rem] font-700 leading-[1.15] text-[#171a1f] md:text-[2.1rem]">
            No WhatsApp, você só vende o que dá tempo de atender.
          </h2>
          <div className="mt-6 max-w-[62ch] space-y-4 text-[1.05rem] leading-relaxed text-[#4a5560]">
            <p>
              Cada venda depende de você responder, achar o produto, montar
              o link de pagamento. Isso trava um teto: passou da sua
              capacidade de atender, você para de vender. Não importa quanto
              esforço você coloque.
            </p>
            <p>
              Na {BRAND.name}, o cliente vê o produto, escolhe e paga
              sozinho, de dia, de noite ou fim de semana, sem precisar de
              você na conversa. Você vende mais, escala sem contratar mais
              gente, e o pagamento cai direto na sua conta.
            </p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 border-b border-[#d9dde3] bg-[#f7f8fa]">
        <div className="mx-auto max-w-[1080px] px-4 py-14 md:px-6 md:py-20">
          <h2 className="font-[family-name:var(--font-brand)] text-[1.7rem] font-700 leading-[1.15] text-[#171a1f] md:text-[2.1rem]">
            Do cadastro à primeira venda, hoje mesmo
          </h2>
          <p className="mt-3 max-w-[48ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
            Cria a conta, monta a vitrine com sua marca e já sai vendendo.
            Sem esperar aprovação, sem precisar de ninguém — leva minutos.
          </p>

          <div className="mt-10 grid gap-8 border-t border-[#d9dde3] pt-8 md:grid-cols-3 md:gap-10">
            <div>
              <h3 className="text-base font-bold text-[#171a1f]">Cria a conta</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#4a5560]">
                Nome da loja, seu e-mail e senha. Menos de 2 minutos.
              </p>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#171a1f]">Monta a loja</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#4a5560]">
                Logo, cores e produtos. Vitrine e painel prontos pra usar.
              </p>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#171a1f]">Você vende</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#4a5560]">
                Pix e cartão. Pedido organizado no painel.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="o-que-inclui" className="scroll-mt-20 border-b border-[#d9dde3] bg-white">
        <div className="mx-auto max-w-[1080px] px-4 py-14 md:px-6 md:py-20">
          <div className="md:flex md:items-end md:justify-between md:gap-10">
            <h2 className="max-w-[20ch] font-[family-name:var(--font-brand)] text-[1.7rem] font-700 leading-[1.15] text-[#171a1f] md:text-[2.1rem]">
              Tudo que sua loja precisa, já incluso
            </h2>
            {demoSlug ? (
              <Link
                href={`/loja/${demoSlug}`}
                className="mt-4 inline-block text-[15px] font-semibold text-accent underline-offset-4 hover:underline md:mt-0"
              >
                Abrir exemplo ao vivo
              </Link>
            ) : null}
          </div>

          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {[
              [
                'Pagamento direto na sua conta',
                'Pix, cartão e boleto direto na sua própria loja. O dinheiro não passa pela gente.',
              ],
              [
                'Frete calculado e etiqueta pronta',
                'Cliente vê o frete real no checkout. Com Melhor Envio, você compra e emite a etiqueta sem sair do painel.',
              ],
              [
                'Nota fiscal integrada',
                'NFC-e emitida direto do pedido, sem planilha paralela.',
              ],
              [
                'Domínio próprio',
                'Use seudominio.com.br na sua loja. O registro do domínio é por sua conta.',
              ],
              [
                'Conta do cliente em segundos',
                'Cadastro simples de nome, e-mail e senha. Depois disso, o cliente acompanha os próprios pedidos.',
              ],
              [
                'Painel completo',
                'Produtos, cupons, promoções, pedidos e clientes em um lugar só.',
              ],
            ].map(([title, text]) => (
              <div key={title} className="border-t border-[#d9dde3] pt-4">
                <dt className="text-base font-bold text-[#171a1f]">{title}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-[#4a5560]">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {plans.length > 0 ? (
        <section id="planos" className="scroll-mt-20 border-b border-[#d9dde3] bg-[#f7f8fa]">
          <div className="mx-auto max-w-[1080px] px-4 py-14 md:px-6 md:py-20">
            <h2 className="font-[family-name:var(--font-brand)] text-[1.7rem] font-700 leading-[1.15] text-[#171a1f] md:text-[2.1rem]">
              Comece de graça. Sem pegadinha, sem cartão.
            </h2>
            <p className="mt-3 max-w-[48ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
              Monta a loja e testa sem gastar nada. Cartão só entra se você
              decidir ficar — e mesmo assim, o preço que você vê é o que você
              paga.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`flex flex-col border bg-white p-5 ${
                    plan.highlight ? 'border-ink' : 'border-[#d9dde3]'
                  }`}
                >
                  {plan.badge ? (
                    <span className="mb-2 self-start border border-[#d9dde3] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                      {plan.badge}
                    </span>
                  ) : null}
                  <h3 className="text-base font-bold text-[#171a1f]">{plan.name}</h3>
                  <p className="mt-1 text-2xl font-bold text-[#171a1f]">
                    {money(plan.amount)}
                    <span className="text-sm font-normal text-muted">/mês</span>
                  </p>
                  {plan.description ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#4a5560]">
                      {plan.description}
                    </p>
                  ) : null}
                  {plan.features?.length ? (
                    <ul className="mt-4 space-y-1.5 border-t border-[#ebebeb] pt-4 text-[13px] text-[#4a5560]">
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="faq" className="scroll-mt-20 border-b border-[#d9dde3] bg-white">
        <div className="mx-auto max-w-[1080px] px-4 py-14 md:px-6 md:py-20">
          <h2 className="font-[family-name:var(--font-brand)] text-[1.7rem] font-700 leading-[1.15] text-[#171a1f] md:text-[2.1rem]">
            Perguntas antes de criar a loja
          </h2>

          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {faq.map(([q, a]) => (
              <div key={q} className="border-t border-[#d9dde3] pt-4">
                <dt className="text-base font-bold text-[#171a1f]">{q}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-[#4a5560]">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="contato" className="scroll-mt-20 bg-accent text-white">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-4 py-14 md:flex-row md:items-end md:justify-between md:gap-10 md:px-6 md:py-16">
          <div className="max-w-xl">
            <h2 className="font-[family-name:var(--font-brand)] text-[1.85rem] font-700 leading-[1.12] md:text-[2.25rem]">
              Não perca mais uma venda. Crie sua loja hoje.
            </h2>
            <p className="mt-3 text-[1.05rem] leading-relaxed text-white/90">
              Comece sem cartão de crédito. Sua loja pode estar no ar em
              poucos minutos — quanto antes começar, antes vende. Se preferir
              conversar antes, também respondemos no WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/criar-conta"
              className="btn bg-white px-5 py-3.5 text-[15px] text-[#171a1f] hover:bg-white/90"
            >
              Criar minha loja grátis agora
            </Link>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="btn border border-white/50 bg-transparent px-5 py-3.5 text-[15px] text-white hover:bg-white/10"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="bg-[#171a1f] text-[#9aa3ad]">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-3 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="max-w-[160px]">
            <BrandLogo height={38} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                WhatsApp
              </a>
            ) : null}
            {CONTACT.email ? (
              <a href={`mailto:${CONTACT.email}`} className="hover:text-white">
                E-mail
              </a>
            ) : null}
            <Link href="/criar-conta" className="hover:text-white">
              Criar loja
            </Link>
            <Link href="/login" className="hover:text-white">
              Área do cliente
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
