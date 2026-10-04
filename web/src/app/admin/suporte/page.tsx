'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/api';
import { CONTACT, whatsappHref } from '@/lib/contact';
import { CabecalhoPagina } from '@/components/admin/Pagina';

/*
 * Suporte da Vendira para o lojista: só WhatsApp. O lojista escolhe o
 * assunto e (se quiser) descreve o problema; a mensagem já sai pronta com a
 * loja e o assunto, e o atendente não precisa perguntar quem é. Cada assunto
 * mostra o atalho da tela que costuma resolver sozinho.
 */

type Assunto = {
  id: string;
  titulo: string;
  exemplo: string;
  atalho?: { rotulo: string; href: string };
};

const ASSUNTOS: Assunto[] = [
  {
    id: 'pagamentos',
    titulo: 'Pagamentos e Mercado Pago',
    exemplo: 'Conexão, pagamento recusado, quando o dinheiro cai',
    atalho: {
      rotulo: 'Ver a conexão com o Mercado Pago',
      href: '/admin/settings?secao=payments',
    },
  },
  {
    id: 'frete',
    titulo: 'Frete e envio',
    exemplo: 'Cotação, etiqueta, Melhor Envio, rastreio',
    atalho: {
      rotulo: 'Abrir as configurações de frete',
      href: '/admin/settings?secao=shipping',
    },
  },
  {
    id: 'pedidos',
    titulo: 'Pedidos e reembolsos',
    exemplo: 'Status do pedido, devolução, estorno',
    atalho: { rotulo: 'Abrir os pedidos', href: '/admin/orders' },
  },
  {
    id: 'produtos',
    titulo: 'Produtos e estoque',
    exemplo: 'Cadastro, fotos, variações, importação',
    atalho: { rotulo: 'Abrir os produtos', href: '/admin/products' },
  },
  {
    id: 'aparencia',
    titulo: 'Aparência da loja',
    exemplo: 'Logo, banner, template, domínio',
    atalho: {
      rotulo: 'Abrir os templates da vitrine',
      href: '/admin/templates',
    },
  },
  {
    id: 'plano',
    titulo: 'Plano e cobrança',
    exemplo: 'Mensalidade, troca de plano, comissão',
    atalho: { rotulo: 'Ver o meu plano', href: '/admin/settings/planos' },
  },
  {
    id: 'outro',
    titulo: 'Outro assunto',
    exemplo: 'Dúvida, sugestão ou algo que não está na lista',
  },
];

const LIMITE = 500;

function IconeWhatsapp({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.99.58 3.84 1.6 5.4L2 22l4.92-1.7a9.86 9.86 0 0 0 5.12 1.4h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.16c-.24.68-1.4 1.25-1.93 1.33-.5.08-1.13.11-1.82-.11-.42-.14-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.97-4.39-.14-.19-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.45.27-.29.59-.36.79-.36h.57c.18 0 .42-.07.66.5.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.38-.42.51-.14.14-.28.29-.12.57.16.28.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.61-.13.24.09 1.55.73 1.82.86.27.14.45.2.52.31.07.11.07.64-.17 1.32z" />
    </svg>
  );
}

export default function AdminSuportePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [assunto, setAssunto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState('');
  const [copiado, setCopiado] = useState(false);

  // localStorage só existe no navegador
  useEffect(() => setUser(getUser()), []);

  const loja = user?.store;
  const escolhido = ASSUNTOS.find((a) => a.id === assunto) ?? null;
  const endereco =
    loja && typeof window !== 'undefined'
      ? `${window.location.origin}/loja/${loja.slug}`
      : '';

  const mensagem = [
    'Olá! Preciso de ajuda com a minha loja na Vendira.',
    loja ? `Loja: ${loja.name}` : null,
    endereco ? `Endereço: ${endereco}` : null,
    user?.email ? `Meu e-mail no painel: ${user.email}` : null,
    escolhido ? `Assunto: ${escolhido.titulo}` : null,
    detalhe.trim() ? `\n${detalhe.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const link = whatsappHref(mensagem);

  async function copiarDados() {
    const texto = [
      loja ? `Loja: ${loja.name}` : null,
      endereco ? `Endereço: ${endereco}` : null,
      user?.email ? `E-mail: ${user.email}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão de área de transferência: segue sem copiar */
    }
  }

  return (
    <div className="admin-page max-w-5xl">
      <CabecalhoPagina
        icone="/admin/suporte"
        titulo="Suporte"
        descricao="Fale com a equipe da Vendira pelo WhatsApp. Diga o assunto e a mensagem já chega com os dados da sua loja."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Conversa */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7f8ee] text-[#1a9e55]"
              aria-hidden
            >
              <IconeWhatsapp />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold">
                Atendimento pelo WhatsApp
              </h2>
              <p className="text-[13px] text-muted">
                {CONTACT.horario
                  ? `Atendemos ${CONTACT.horario}. Fora desse horário, deixe a mensagem: respondemos assim que voltarmos.`
                  : 'Deixe a mensagem com o assunto: respondemos pela ordem de chegada.'}
              </p>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            <fieldset>
              <legend className="text-sm font-semibold">
                1. Sobre o que é?
              </legend>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {ASSUNTOS.map((a) => {
                  const ativo = a.id === assunto;
                  return (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-3 transition-colors ${
                        ativo
                          ? 'border-[var(--brand-deep)] bg-[#f2f8f9] ring-1 ring-[var(--brand-deep)]'
                          : 'border-line hover:border-[#c9d3d8] hover:bg-[#fafbfc]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="assunto"
                        className="mt-1 accent-[var(--brand-deep)]"
                        checked={ativo}
                        onChange={() => setAssunto(a.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {a.titulo}
                        </span>
                        <span className="block text-xs text-muted">
                          {a.exemplo}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {escolhido?.atalho ? (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f4f6f8] px-4 py-3 text-sm">
                <span className="text-muted">
                  Muitas vezes isso se resolve direto no painel.
                </span>
                <Link
                  href={escolhido.atalho.href}
                  className="font-semibold text-[var(--brand-deep)] underline-offset-2 hover:underline"
                >
                  {escolhido.atalho.rotulo} →
                </Link>
              </p>
            ) : null}

            <div>
              <label className="text-sm font-semibold" htmlFor="detalhe">
                2. Conte rapidinho o que aconteceu{' '}
                <span className="font-normal text-muted">(opcional)</span>
              </label>
              <textarea
                id="detalhe"
                className="field mt-2 min-h-[96px] w-full resize-y text-sm"
                maxLength={LIMITE}
                placeholder="Ex.: o pedido #000332 está como pago, mas o cliente diz que não recebeu o e-mail."
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
              />
              <p className="mt-1 text-right text-[11px] tabular-nums text-muted">
                {detalhe.length}/{LIMITE}
              </p>
            </div>

            {link ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!assunto}
                  onClick={(e) => {
                    if (!assunto) e.preventDefault();
                  }}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-white transition ${
                    assunto
                      ? 'bg-[#1a9e55] hover:bg-[#168a4a]'
                      : 'cursor-not-allowed bg-[#9fcdb3]'
                  }`}
                >
                  <IconeWhatsapp tamanho={18} />
                  Continuar no WhatsApp
                </a>
                <span className="text-xs text-muted">
                  {assunto
                    ? 'Abre o WhatsApp com a mensagem pronta. É só enviar.'
                    : 'Escolha o assunto para continuar.'}
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-[#f0d998] bg-[#fff8e1] px-4 py-3 text-sm text-[#6b4f00]">
                <p className="font-semibold">
                  O WhatsApp do suporte ainda não está disponível.
                </p>
                <p className="mt-0.5">
                  {CONTACT.email ? (
                    <>
                      Enquanto isso, escreva para{' '}
                      <a
                        className="font-semibold underline"
                        href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(
                          `Suporte${escolhido ? ` - ${escolhido.titulo}` : ''}${loja ? ` - ${loja.name}` : ''}`,
                        )}&body=${encodeURIComponent(mensagem)}`}
                      >
                        {CONTACT.email}
                      </a>
                      .
                    </>
                  ) : (
                    'Tente de novo mais tarde.'
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Lateral */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-[15px] font-bold">Antes de chamar</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              {[
                'O número do pedido, se for sobre um pedido',
                'Um print da tela ou da mensagem de erro',
                'O que você já tentou fazer',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-teal)]"
                    aria-hidden
                  />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Com isso, a gente resolve na primeira resposta.
            </p>
          </section>

          {loja ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-[15px] font-bold">Seus dados</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Loja</dt>
                  <dd className="font-semibold">{loja.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Endereço</dt>
                  <dd className="break-all">/loja/{loja.slug}</dd>
                </div>
                {user?.email ? (
                  <div>
                    <dt className="text-xs text-muted">E-mail do painel</dt>
                    <dd className="break-all">{user.email}</dd>
                  </div>
                ) : null}
              </dl>
              <button
                type="button"
                className="btn btn-ghost mt-3 h-9 w-full text-[13px]"
                onClick={() => void copiarDados()}
              >
                {copiado ? 'Copiado' : 'Copiar dados'}
              </button>
              <p className="mt-2 text-xs text-muted">
                Já vão na mensagem. Use o botão se for falar por outro meio.
              </p>
            </section>
          ) : null}

          <p className="px-1 text-xs leading-relaxed text-muted">
            O suporte da Vendira nunca pede a sua senha nem o código da
            verificação em duas etapas.
          </p>
        </aside>
      </div>
    </div>
  );
}
