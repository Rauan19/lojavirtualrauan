import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteHeader } from '@/components/SiteHeader';
import { BRAND } from '@/lib/brand';
import { CONTACT, whatsappHref } from '@/lib/contact';
import { getPlans, siteUrl } from '@/lib/seo';

// Mockup do hero: representa a própria vitrine, não é foto de banco de
// imagem. Ilustrações vetoriais geradas por nós, com fundo em cor lisa —
// não fingem ser fotografia de produto.
const mockupProducts = [
  { tone: 'bg-[#f3d9df]', icon: 'camiseta', name: 'Camiseta Básica', price: 'R$ 79,90' },
  { tone: 'bg-[#dbe7f2]', icon: 'bone', name: 'Boné Aba Reta', price: 'R$ 59,90' },
  { tone: 'bg-[#e3ecdd]', icon: 'mochila', name: 'Mochila Urbana', price: 'R$ 199,90' },
  { tone: 'bg-[#f2e6d3]', icon: 'tenis', name: 'Tênis Casual', price: 'R$ 249,90' },
] as const;

function ProductIcon({ type }: { type: (typeof mockupProducts)[number]['icon'] }) {
  const stroke = '#171a1f';
  const common = { fill: 'none', stroke, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (type === 'camiseta') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <path
          {...common}
          d="M22 10 L14 16 L8 24 L15 29 L20 25 L20 54 L44 54 L44 25 L49 29 L56 24 L50 16 L42 10 C42 15 37 18 32 18 C27 18 22 15 22 10 Z"
        />
      </svg>
    );
  }
  if (type === 'bone') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <path {...common} d="M14 34 C14 20 22 12 33 12 C44 12 51 20 51 32" />
        <path {...common} d="M12 34 C20 30 44 30 52 34 C52 38 46 40 32 40 C18 40 12 38 12 34 Z" />
        <path {...common} d="M12 34 L6 36" />
      </svg>
    );
  }
  if (type === 'mochila') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <path {...common} d="M22 22 C22 14 42 14 42 22 L42 24" />
        <rect x="16" y="24" width="32" height="30" rx="4" {...common} />
        <path {...common} d="M24 24 L24 34 L40 34 L40 24" />
        <path {...common} d="M28 40 L36 40" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <path
        {...common}
        d="M8 44 L8 36 C12 36 15 34 18 30 C21 27 24 26 28 27 L28 33 L40 33 C46 33 52 36 56 40 L56 44 Z"
      />
      <path {...common} d="M8 44 L56 44" />
      <path {...common} d="M20 33 L20 27" />
    </svg>
  );
}

const faq: [string, string][] = [
  [
    'Preciso saber programar?',
    'Não. Você cadastra produto, define cor e logo, e a loja fica no ar. Quem cuida do resto é a gente.',
  ],
  [
    'O que acontece depois dos 14 dias grátis?',
    'Se não escolher um plano, o painel fica só de leitura até você assinar. A vitrine continua vendendo normalmente, e nada é cobrado sem sua confirmação.',
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
  const plans = (await getPlans()) || [];
  const base = siteUrl();

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
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

      <section className="overflow-hidden border-b border-[#d9dde3] bg-[#f7f8fa]">
        <div className="mx-auto flex max-w-[1180px] flex-col md:min-h-[min(52vh,440px)] md:flex-row md:items-stretch">
          <div className="flex flex-1 flex-col justify-center px-4 pb-6 pt-[4rem] md:max-w-[48%] md:px-6 md:pb-8 md:pt-20 lg:pr-8">
            <h1 className="max-w-[16ch] font-[family-name:var(--font-brand)] text-[2.35rem] font-800 leading-[1.03] tracking-tight text-[#171a1f] md:text-[3.4rem]">
              Sua loja vende sozinha.{' '}
              <span style={{ color: 'var(--accent)' }}>Você só vê o dinheiro entrar.</span>
            </h1>
            <p className="mt-3.5 max-w-[38ch] text-[15px] leading-relaxed text-[#4a5560] md:mt-4 md:text-[16px]">
              Cliente compra a qualquer hora, sem você responder um por um no
              WhatsApp. Sem teto de atendimento, sem ponto caro pra abrir.
              Mais vendas com o mesmo esforço.
            </p>
            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href="/criar-conta"
                className="btn btn-accent relative px-6 py-4 text-center text-[15px] drop-shadow-[0_10px_16px_rgba(227,28,95,0.35)] before:absolute before:left-0 before:top-0 before:h-4 before:w-4 before:content-[''] before:[background:radial-gradient(circle_at_bottom_right,transparent_16px,#f7f8fa_16px)] after:absolute after:right-0 after:top-0 after:h-4 after:w-4 after:content-[''] after:[background:radial-gradient(circle_at_bottom_left,transparent_16px,#f7f8fa_16px)] sm:py-3.5"
              >
                Criar minha loja grátis
              </Link>
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
              14 dias grátis · sem cartão de crédito
            </p>
          </div>

          <div
            className="relative flex min-h-[300px] w-full items-center justify-center border-t border-[#d9dde3] bg-[#eef0f3] p-5 py-8 md:h-auto md:min-h-0 md:w-[52%] md:border-l md:border-t-0 md:p-8"
            aria-hidden
          >
            <div className="w-full max-w-[380px] overflow-hidden rounded-lg border border-[#d9dde3] bg-[#fbfbfc] shadow-[0_20px_50px_-20px_rgba(23,26,31,0.35)]">
              <div className="flex items-center gap-2 border-b border-[#d9dde3] bg-[#f1f2f4] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e0603d]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e0b23d]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4caf6e]" />
                <span className="ml-2 flex-1 truncate rounded-full bg-white px-3 py-1 text-center text-[10px] text-[#8a92a0]">
                  suaLoja.com.br
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#d9dde3] bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center bg-accent text-[11px] font-bold text-white">
                    S
                  </span>
                  <span className="text-[13px] font-bold text-[#171a1f]">
                    Sua Loja
                  </span>
                </div>
                <span className="text-[11px] text-[#4a5560]">Carrinho (2)</span>
              </div>

              <div className="grid grid-cols-2 gap-px bg-[#d9dde3] p-px">
                {mockupProducts.map((p) => (
                  <div key={p.name} className="bg-white p-2.5">
                    <div className={`h-16 w-full p-3 ${p.tone}`}>
                      <ProductIcon type={p.icon} />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-[#171a1f]">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-[#4a5560]">{p.price}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#d9dde3] bg-white px-3 py-2.5">
                <span className="inline-block bg-accent px-3 py-1.5 text-[11px] font-bold text-white">
                  Finalizar compra
                </span>
              </div>
            </div>
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
            <Link
              href="/loja/demo"
              className="mt-4 inline-block text-[15px] font-semibold text-accent underline-offset-4 hover:underline md:mt-0"
            >
              Abrir exemplo ao vivo
            </Link>
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
              Testa 14 dias sem gastar nada. Cartão só entra se você decidir
              ficar — e mesmo assim, o preço que você vê é o que você paga.
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
              14 dias grátis, sem cartão. Sua loja pode estar no ar em poucos
              minutos — quanto antes começar, antes vende. Se preferir
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
            <BrandLogo height={30} onDark />
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
