'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type LojaResumo = {
  slug: string;
  logoUrl?: string | null;
  mpAccessTokenSet?: boolean;
  freteCepOrigem?: string | null;
  freteRuaOrigem?: string | null;
  freteNumeroOrigem?: string | null;
  freteCidadeOrigem?: string | null;
  freteUfOrigem?: string | null;
};

type Passo = {
  id: string;
  titulo: string;
  detalhe: string;
  feito: boolean;
  href: string;
  acao: string;
  novaAba?: boolean;
};

/**
 * Roteiro de primeiros passos para loja nova: o que falta para começar a
 * vender, na ordem. Some sozinho quando tudo está feito, ou quando o lojista
 * esconde. O "ver a loja" conta como feito ao clicar.
 */
export function PrimeirosPassos() {
  const [loja, setLoja] = useState<LojaResumo | null>(null);
  const [produtos, setProdutos] = useState<number | null>(null);
  const [viuLoja, setViuLoja] = useState(false);
  const [escondido, setEscondido] = useState(true);

  const slug = getUser()?.store?.slug ?? '';
  const chave = (nome: string) => `vendira:primeiros-passos:${slug}:${nome}`;

  useEffect(() => {
    const token = getToken();
    if (!token || !slug) return;
    try {
      setEscondido(localStorage.getItem(chave('escondido')) === '1');
      setViuLoja(localStorage.getItem(chave('viu-loja')) === '1');
    } catch {
      setEscondido(false);
    }
    api<LojaResumo>('/stores/me', { token, storeSlug: slug })
      .then(setLoja)
      .catch(() => undefined);
    api<{ total: number }>('/admin/products?limit=1', {
      token,
      storeSlug: slug,
    })
      .then((r) => setProdutos(r.total))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!loja || produtos === null || escondido) return null;

  const temOrigem = Boolean(
    (loja.freteCepOrigem || '').replace(/\D/g, '').length === 8 &&
    loja.freteRuaOrigem?.trim() &&
    loja.freteNumeroOrigem?.trim() &&
    loja.freteCidadeOrigem?.trim() &&
    loja.freteUfOrigem?.trim(),
  );

  const passos: Passo[] = [
    {
      id: 'pagamento',
      titulo: 'Conectar o Mercado Pago',
      detalhe:
        'É onde o dinheiro das vendas cai. Sem isso o cliente não consegue pagar.',
      feito: Boolean(loja.mpAccessTokenSet),
      href: '/admin/settings?secao=payments',
      acao: 'Conectar',
    },
    {
      id: 'produto',
      titulo: 'Cadastrar o primeiro produto',
      detalhe: 'Nome, preço e uma boa foto já bastam para começar.',
      feito: produtos > 0,
      href: '/admin/products',
      acao: 'Cadastrar',
    },
    {
      id: 'frete',
      titulo: 'Informar o endereço de envio',
      detalhe: 'De onde os pedidos saem. É com ele que o frete é calculado.',
      feito: temOrigem,
      href: '/admin/settings?secao=shipping',
      acao: 'Informar',
    },
    {
      id: 'marca',
      titulo: 'Colocar a logo da loja',
      detalhe: 'Aparece no topo da vitrine e nos e-mails para o cliente.',
      feito: Boolean(loja.logoUrl),
      href: '/admin/settings?secao=branding',
      acao: 'Enviar logo',
    },
    {
      id: 'ver',
      titulo: 'Ver a loja como cliente',
      detalhe: 'Abra a vitrine e confira como ficou antes de divulgar.',
      feito: viuLoja,
      href: `/loja/${loja.slug}`,
      acao: 'Abrir a loja',
      novaAba: true,
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  function esconder() {
    try {
      localStorage.setItem(chave('escondido'), '1');
    } catch {
      /* sem armazenamento: esconde só nesta visita */
    }
    setEscondido(true);
  }

  function marcarVisto() {
    try {
      localStorage.setItem(chave('viu-loja'), '1');
    } catch {
      /* segue sem lembrar */
    }
    setViuLoja(true);
  }

  const proximo = passos.find((p) => !p.feito);

  return (
    <section
      aria-labelledby="primeiros-passos-titulo"
      className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="primeiros-passos-titulo" className="text-base font-bold">
            Deixe sua loja pronta para vender
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {feitos} de {passos.length} passos concluídos
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-muted hover:text-ink"
          onClick={esconder}
        >
          Esconder
        </button>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={passos.length}
        aria-valuenow={feitos}
        aria-label="Progresso dos primeiros passos"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${(feitos / passos.length) * 100}%` }}
        />
      </div>

      <ol className="mt-4 divide-y divide-line">
        {passos.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                p.feito
                  ? 'bg-emerald-500 text-white'
                  : p.id === proximo?.id
                    ? 'bg-ink text-white'
                    : 'bg-zinc-100 text-muted'
              }`}
              aria-hidden
            >
              {p.feito ? '✓' : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-semibold ${p.feito ? 'text-muted line-through' : 'text-ink'}`}
              >
                {p.titulo}
              </span>
              {!p.feito ? (
                <span className="block text-xs text-muted">{p.detalhe}</span>
              ) : null}
            </span>
            {!p.feito ? (
              <Link
                href={p.href}
                target={p.novaAba ? '_blank' : undefined}
                rel={p.novaAba ? 'noopener noreferrer' : undefined}
                onClick={p.id === 'ver' ? marcarVisto : undefined}
                className={`btn shrink-0 py-1.5 text-xs ${p.id === proximo?.id ? 'btn-accent' : 'btn-ghost'}`}
              >
                {p.acao}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
