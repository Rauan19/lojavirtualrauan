import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { StoreDeviceShowcase } from '@/components/StoreDeviceShowcase';
import { HeroComecar } from '@/components/landing/HeroComecar';
import {
  AvisoVendeu,
  CartaoCupom,
  CartaoFrete,
  Celular,
  CheckoutMock,
  Notebook,
  PainelMock,
} from '@/components/landing/LpVisuais';
import { BRAND } from '@/lib/brand';
import { CONTACT, whatsappHref } from '@/lib/contact';
import { getDemoStoreSlug, getPlans, siteUrl } from '@/lib/seo';
import { LEGAL, empresaIdentificada } from '@/lib/legal';

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
    'Sim, pequena e mostrada em cada plano acima. Ela sai automaticamente de cada venda aprovada, sem boleto à parte, e quanto maior o plano, menor a taxa. As tarifas do Mercado Pago (cartão e Pix) são cobradas por ele, como em qualquer loja.',
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

/** 200 pontos-base → "2%"; 50 → "0,5%" */
function taxaTexto(bps: number) {
  return `${String(bps / 100).replace('.', ',')}%`;
}

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
      name: plan.periodDays >= 360 ? `${plan.name} (anual)` : plan.name,
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
      <SiteHeader />

      {/*
        Hero no padrão Nuvemshop/Shopify: título grande, o cadastro começando
        ali mesmo (nome da loja + botão num campo só) e, ao lado, a loja
        rodando no notebook e no celular, com o pedido pago e o frete
        flutuando em volta: o que o lojista vai ver no dia a dia.
      */}
      <section className="lp-hero relative overflow-hidden bg-[var(--brand-deep)] text-white">
        <div className="lp-hero-glow" aria-hidden />
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-12 px-4 pb-16 pt-[6.5rem] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-10 md:px-6 md:pb-24 md:pt-[9rem] lg:gap-16">
          <div>
            <h1 className="max-w-[16ch] font-[family-name:var(--font-brand)] text-[2.4rem] font-800 leading-[1.02] tracking-[-0.03em] text-balance text-white md:text-[3.5rem] lg:text-[4rem]">
              Sua loja virtual vende 24 horas por dia.{' '}
              <span className="text-[var(--brand-coral)]">
                Sem depender do seu atendimento.
              </span>
            </h1>
            <div className="mt-8">
              <HeroComecar />
            </div>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                Prefiro falar antes no WhatsApp
              </a>
            ) : null}
          </div>

          <div className="relative mx-auto w-full max-w-[520px] md:max-w-none" aria-hidden>
            <div className="lp-hero-devices">
              <StoreDeviceShowcase />
            </div>
            <CartaoCupom className="lp-flutua absolute -bottom-4 left-0 hidden sm:flex md:-left-6" />
            <CartaoFrete className="lp-flutua lp-flutua--2 absolute -top-6 right-0 hidden sm:flex md:right-2" />
          </div>
        </div>
      </section>

      {/* O problema, com a resposta ao lado: o pedido chegando no celular */}
      <section className="overflow-hidden bg-white">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 py-16 md:grid-cols-[1.05fr_1fr] md:gap-16 md:px-6 md:py-24">
          <div>
            <h2 className="max-w-[18ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
              No WhatsApp, você só vende o que dá tempo de atender.
            </h2>
            <div className="mt-6 max-w-[56ch] space-y-4 text-[1.05rem] leading-relaxed text-[#4a5560]">
              <p>
                Cada venda depende de você responder, achar o produto e montar o
                link de pagamento. Passou da sua capacidade de atender, você
                para de vender.
              </p>
              <p>
                Na {BRAND.name}, o cliente vê o produto, escolhe e paga sozinho,
                de dia, de noite ou no fim de semana. Você só fica sabendo
                quando o dinheiro já entrou.
              </p>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[22rem] pb-6 md:max-w-none md:pl-10">
            <div className="lp-halo" aria-hidden />
            <Celular
              src="/site/exemplo-celular-produto.webp"
              alt={`Página de produto de uma loja feita na ${BRAND.name}, aberta no celular`}
              className="relative mx-auto w-[68%] md:w-[58%]"
            />
            <AvisoVendeu className="absolute bottom-0 left-0 md:-left-2 md:bottom-12" />
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 bg-[#f7f8fa]">
        <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-6 md:py-24">
          <h2 className="max-w-[22ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
            Do cadastro à primeira venda, hoje mesmo
          </h2>
          <p className="mt-4 max-w-[52ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
            Sem esperar aprovação e sem precisar de ninguém. Leva minutos.
          </p>

          {/* A ordem importa aqui, por isso os passos numerados */}
          <ol className="lp-passos mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              [
                'Cria a conta',
                'Nome da loja, seu e-mail e senha. Menos de 2 minutos.',
              ],
              [
                'Monta a loja',
                'Logo, cor, banner e produtos. A vitrine já sai pronta para o celular.',
              ],
              [
                'Você vende',
                'Conecta o Mercado Pago e recebe por Pix e cartão. O pedido chega organizado no painel.',
              ],
            ].map(([titulo, texto], i) => (
              <li key={titulo} className="relative">
                <span className="lp-passo-num">{i + 1}</span>
                <h3 className="mt-5 text-[1.15rem] font-bold text-[#171a1f]">
                  {titulo}
                </h3>
                <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-[#4a5560]">
                  {texto}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="o-que-inclui" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-[1180px] space-y-24 px-4 py-16 md:space-y-32 md:px-6 md:py-24">
          {/* Vitrine */}
          <div className="grid items-center gap-12 md:grid-cols-[1fr_1.15fr] md:gap-16">
            <div>
              <h2 className="max-w-[18ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
                Uma loja com a sua cara, no computador e no celular
              </h2>
              <p className="mt-5 max-w-[50ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
                Sua logo, sua cor e seus banners. Categorias, busca, favoritos e
                sacola já vêm prontos, e cada página se ajusta sozinha ao
                celular, que é onde a maioria dos clientes compra.
              </p>
              {demoSlug ? (
                <Link
                  href={`/loja/${demoSlug}`}
                  className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent underline-offset-4 hover:underline"
                >
                  Ver uma loja de exemplo
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
            </div>
            <div className="relative pb-10 pr-6 md:pr-12">
              <div className="lp-halo" aria-hidden />
              <div className="relative">
                <Notebook
                  src="/site/exemplo-computador-home.webp"
                  alt={`Página inicial de uma loja feita na ${BRAND.name}, no computador`}
                />
              </div>
              <div className="absolute -bottom-2 right-0 w-[27%]">
                <Celular
                  src="/site/exemplo-celular-home.webp"
                  alt="A mesma loja aberta no celular"
                  className="border-[6px]"
                />
              </div>
            </div>
          </div>

          {/* Checkout */}
          <div className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
            <div className="relative order-2 flex justify-center md:order-1">
              <div className="lp-halo" aria-hidden />
              <div className="relative w-full max-w-[25rem]">
                <CheckoutMock />
              </div>
            </div>
            <div className="order-1 md:order-2">
              <h2 className="max-w-[18ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
                Frete pelo CEP e pagamento direto na sua conta
              </h2>
              <p className="mt-5 max-w-[50ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
                O cliente vê o frete real das transportadoras e paga por Pix ou
                cartão em até 12x. O dinheiro vai para a sua conta do Mercado
                Pago, sem passar pela gente. Com o Melhor Envio, a etiqueta sai
                do próprio pedido.
              </p>
            </div>
          </div>

          {/* Painel */}
          <div className="grid items-center gap-12 md:grid-cols-[1fr_1.15fr] md:gap-16">
            <div>
              <h2 className="max-w-[18ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
                Um painel para cuidar de tudo, até pelo celular
              </h2>
              <p className="mt-5 max-w-[50ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
                Pedidos, produtos, clientes, cupons e frete no mesmo lugar.
                Chame sua equipe com acesso só ao que cada um precisa, e receba
                um aviso no celular a cada venda.
              </p>
            </div>
            <div className="relative">
              <div className="lp-halo" aria-hidden />
              <div className="relative">
                <PainelMock />
              </div>
            </div>
          </div>

          {/* O resto que já vem incluso, em lista (não em cartões) */}
          <div>
            <h2 className="max-w-[22ch] font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
              E mais o que uma loja precisa
            </h2>
            <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  'Nota fiscal',
                  'NFC-e emitida direto do pedido, sem planilha paralela.',
                ],
                [
                  'Domínio próprio',
                  'Use seudominio.com.br. O registro do domínio é por sua conta.',
                ],
                [
                  'Cupons e promoções',
                  'Desconto por cupom, preço promocional e frete grátis acima de um valor.',
                ],
                [
                  'Compre junto',
                  'Sugira produtos que combinam e dê desconto para quem leva o conjunto.',
                ],
                [
                  'Carrinho abandonado',
                  'Veja quem não pagou e mande um lembrete com a sacola pronta.',
                ],
                [
                  'Avaliações',
                  'Clientes avaliam o que compraram, e você aprova antes de aparecer.',
                ],
                [
                  'Conta do cliente',
                  'O cliente acompanha os próprios pedidos e o rastreio.',
                ],
                [
                  'Equipe na loja',
                  'Mais pessoas no painel, cada uma com o acesso que você liberar.',
                ],
              ].map(([titulo, texto]) => (
                <div key={titulo} className="border-t border-[#d9dde3] pt-4">
                  <dt className="text-base font-bold text-[#171a1f]">
                    {titulo}
                  </dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-[#4a5560]">
                    {texto}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {plans.length > 0 ? (
        <section id="planos" className="scroll-mt-20 bg-[#f7f8fa]">
          <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-6 md:py-24">
            <h2 className="font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
              Comece de graça. Sem pegadinha, sem cartão.
            </h2>
            <p className="mt-3 max-w-[48ch] text-[1.05rem] leading-relaxed text-[#4a5560]">
              Monta a loja e testa sem gastar nada. Cartão só entra se você
              decidir ficar — e mesmo assim, o preço que você vê é o que você
              paga.
            </p>

            {plans.some((p) => p.periodDays >= 360) ? (
              <p className="mt-3 text-sm font-semibold text-[#171a1f]">
                No plano anual você ganha 2 meses grátis.
              </p>
            ) : null}

            <div className="mt-12 grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
              {plans
                .filter((plan, _i, all) =>
                  all.some((p) => p.periodDays < 360)
                    ? plan.periodDays < 360
                    : true,
                )
                .map((plan) => {
                  // O que muda entre os planos, com os números reais do banco
                  const fatos = [
                    plan.feeBps && plan.feeBps > 0
                      ? `${taxaTexto(plan.feeBps)} por venda aprovada`
                      : 'Sem taxa por venda',
                    plan.maxProducts
                      ? `Até ${plan.maxProducts} produtos`
                      : 'Produtos ilimitados',
                    !plan.maxUsers
                      ? 'Equipe sem limite'
                      : plan.maxUsers === 1
                        ? 'Só você no painel'
                        : `Até ${plan.maxUsers} pessoas no painel`,
                  ];
                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col rounded-[18px] bg-white p-5 ${
                        plan.highlight
                          ? 'border-2 border-[#171a1f] shadow-[0_18px_40px_-24px_rgba(23,26,31,0.45)]'
                          : 'border border-[#d9dde3]'
                      }`}
                    >
                      {plan.badge ? (
                        <span
                          className={`absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                            plan.highlight
                              ? 'bg-[#171a1f] text-white'
                              : 'border border-[#d9dde3] bg-white text-[#4a5560]'
                          }`}
                        >
                          {plan.badge}
                        </span>
                      ) : null}
                      <h3 className="text-base font-bold text-[#171a1f]">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-[1.75rem] font-bold leading-tight tabular-nums text-[#171a1f]">
                        {plan.amount > 0 ? (
                          <>
                            {money(plan.amount)}
                            <span className="text-sm font-normal text-[#4a5560]">
                              /mês
                            </span>
                          </>
                        ) : (
                          'Grátis'
                        )}
                      </p>
                      {plan.description ? (
                        <p className="mt-2 text-sm leading-relaxed text-[#4a5560]">
                          {plan.description}
                        </p>
                      ) : null}
                      <ul className="mt-4 space-y-2 border-t border-[#ebebeb] pt-4 text-[13px] text-[#171a1f]">
                        {[
                          ...fatos,
                          // Limites e taxa vêm dos números reais acima; o texto livre
                          // do plano não repete (nem contradiz) esses itens
                          ...(plan.features || []).filter(
                            (t) =>
                              !/produto|pessoa|equipe|taxa|por venda/i.test(t),
                          ),
                        ].map((f) => (
                          <li key={f} className="flex gap-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                              className="mt-0.5 shrink-0 text-[var(--ok)]"
                            >
                              <path
                                d="m5 12.5 4.2 4.2L19 7"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/criar-conta"
                        className={`btn mt-5 h-11 w-full text-[14px] ${
                          plan.highlight ? 'btn-accent' : 'btn-ghost'
                        }`}
                      >
                        {plan.amount > 0 ? 'Testar grátis' : 'Começar grátis'}
                      </Link>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      ) : null}

      <section id="faq" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-16 md:grid-cols-[1fr_1.7fr] md:gap-16 md:px-6 md:py-24">
          <h2 className="font-[family-name:var(--font-brand)] text-[1.75rem] font-800 leading-[1.12] tracking-tight text-balance text-[#171a1f] md:text-[2.4rem]">
            Perguntas antes de criar a loja
          </h2>

          <div className="divide-y divide-[#d9dde3] border-y border-[#d9dde3]">
            {faq.map(([q, a]) => (
              <details key={q} className="lp-faq group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[1.05rem] font-bold text-[#171a1f]">
                  {q}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className="shrink-0 text-[#4a5560] transition-transform duration-200 group-open:rotate-45"
                  >
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <p className="-mt-1 max-w-[62ch] pb-5 text-[15px] leading-relaxed text-[#4a5560]">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id="contato"
        className="scroll-mt-20 bg-[var(--brand-deep)] text-white"
      >
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-16 md:flex-row md:items-end md:justify-between md:gap-10 md:px-6 md:py-20">
          <div className="max-w-xl">
            <h2 className="font-[family-name:var(--font-brand)] text-[1.85rem] font-700 leading-[1.12] md:text-[2.25rem]">
              Não perca mais uma venda. Crie sua loja hoje.
            </h2>
            <p className="mt-3 text-[1.05rem] leading-relaxed text-white/90">
              Comece sem cartão de crédito. Sua loja pode estar no ar em poucos
              minutos — quanto antes começar, antes vende. Se preferir conversar
              antes, também respondemos no WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/criar-conta"
              className="btn h-12 bg-white px-6 text-[15px] text-[#171a1f] hover:bg-white/90"
            >
              Criar minha loja grátis agora
            </Link>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="btn h-12 border border-white/50 bg-transparent px-6 text-[15px] text-white hover:bg-white/10"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="bg-[#171a1f] text-[#9aa3ad]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="max-w-[160px]">
            <BrandLogo height={38} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
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
            <Link href="/termos" className="hover:text-white">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-white">
              Privacidade
            </Link>
          </div>
        </div>
        {/* Decreto 7.962/2013: quem vende online se identifica no site */}
        <div className="mx-auto max-w-[1180px] border-t border-white/10 px-4 py-4 text-xs text-[#7d8792] md:px-6">
          <p>
            {empresaIdentificada()}
            {LEGAL.endereco ? ` · ${LEGAL.endereco}` : ''}
          </p>
        </div>
      </footer>
    </main>
  );
}
