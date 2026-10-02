'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import { MiniaturaTemplate } from '@/components/templates/MiniaturaTemplate';
import {
  precoTexto,
  RECEITA_BASE,
  SEGMENTOS,
  type TemplateItem,
} from '@/lib/templates';

type Loja = {
  slug: string;
  storeTheme?: string | null;
  accentColor?: string | null;
};

function seloAcesso(t: TemplateItem) {
  if (t.acesso === 'pago') return precoTexto(t.precoCentavos) || 'Pago';
  if (t.acesso === 'plano') return 'Planos maiores';
  return null;
}

export default function TemplatesPage() {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [lista, setLista] = useState<TemplateItem[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    const opts = { token: getToken(), storeSlug: getUser()?.store?.slug };
    Promise.all([
      api<Loja>('/stores/me', opts),
      api<TemplateItem[]>('/admin/templates', opts),
    ])
      .then(([l, t]) => {
        setLoja(l);
        setLista(t);
      })
      .catch((e) =>
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar'),
      );
  }, []);

  const atual = loja?.storeTheme || 'essencial';
  const emUso = lista.find((t) => t.chave === atual);
  const cor = loja?.accentColor || '#0d3a43';

  // Só mostra os filtros que têm template
  const filtros = useMemo(
    () =>
      SEGMENTOS.filter((s) => lista.some((t) => t.segmentos.includes(s.key))),
    [lista],
  );
  const visiveis = lista.filter(
    (t) => filtro === 'todos' || t.segmentos.includes(filtro),
  );

  async function usar(chave: string) {
    setSalvando(chave);
    setErro('');
    setAviso('');
    try {
      // Fonte e foto voltam ao "automático" para valer a sugestão do template
      const nova = await api<Loja>('/stores/me/branding', {
        method: 'PATCH',
        token: getToken(),
        storeSlug: getUser()?.store?.slug,
        body: { storeTheme: chave, storeFont: '', storeCardRatio: '' },
      });
      setLoja(nova);
      setAviso(
        `Template ${lista.find((t) => t.chave === chave)?.nome} aplicado na sua loja.`,
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível trocar o template',
      );
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="admin-page max-w-6xl">
      <CabecalhoPagina
        icone="/admin/templates"
        titulo="Templates da loja"
        descricao="Escolha um template pronto para a sua vitrine. Sua cor e sua logo continuam; o template muda fontes, cartões, banner e fundo."
      />

      {erro ? (
        <p
          role="alert"
          className="rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]"
        >
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-xl border border-[#bfe3c8] bg-[#f0fbf3] px-4 py-3 text-sm text-[#166534]">
          {aviso}
        </p>
      ) : null}

      {/* Template em uso, sempre à vista */}
      {loja ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center">
          <div className="w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-line sm:w-52">
            <MiniaturaTemplate
              receita={emUso?.receita ?? RECEITA_BASE}
              cor={cor}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-muted">
              Template em uso
            </p>
            <h2 className="text-[20px] font-bold leading-tight">
              {emUso?.nome ?? 'Essencial'}
            </h2>
            {emUso?.descricao ? (
              <p className="mt-1 text-[14px] leading-relaxed text-muted">
                {emUso.descricao}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={`/loja/${loja.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost h-10 px-4 text-[14px]"
            >
              Ver minha loja
            </a>
            <Link
              href="/admin/settings"
              className="btn btn-ghost h-10 px-4 text-[14px]"
            >
              Ajustar cores e fonte
            </Link>
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold">
            Todos os templates{' '}
            <span className="font-normal text-muted">({lista.length})</span>
          </h2>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filtrar por tipo de loja"
          >
            {[{ key: 'todos', label: 'Todos' }, ...filtros].map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={filtro === s.key}
                onClick={() => setFiltro(s.key)}
                className={`h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                  filtro === s.key
                    ? 'bg-[var(--brand-deep)] text-white'
                    : 'border border-line bg-white text-ink hover:border-[var(--brand-teal)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((t) => {
            const ativo = t.chave === atual;
            const bloqueio =
              t.liberacao && !t.liberacao.liberado ? t.liberacao.precisa : null;
            const selo = seloAcesso(t);
            return (
              <li
                key={t.chave}
                className={`flex flex-col overflow-hidden rounded-2xl bg-white transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(13,58,67,0.55)] ${
                  ativo ? 'ring-2 ring-[var(--brand-deep)]' : 'ring-1 ring-line'
                }`}
              >
                <div className="relative">
                  <MiniaturaTemplate receita={t.receita} cor={cor} />
                  <div className="absolute inset-x-2 top-2 flex justify-between gap-2">
                    {selo ? (
                      <span className="rounded-full bg-[#fff6e0] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
                        {selo}
                      </span>
                    ) : (
                      <span />
                    )}
                    {ativo ? (
                      <span className="rounded-full bg-[var(--brand-deep)] px-2 py-0.5 text-[11px] font-semibold text-white">
                        Em uso
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-1 flex-col border-t border-line p-3.5">
                  <h3 className="text-[15px] font-bold">{t.nome}</h3>
                  <p className="mt-0.5 line-clamp-2 flex-1 text-[12.5px] leading-snug text-muted">
                    {t.paraQuem}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {loja ? (
                      <a
                        href={`/loja/${loja.slug}?tema=${t.chave}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost h-9 flex-1 px-2 text-[13px]"
                      >
                        Prévia
                      </a>
                    ) : null}
                    {bloqueio === 'plano' ? (
                      <Link
                        href="/admin/settings/planos"
                        className="btn btn-accent h-9 flex-1 px-2 text-[13px]"
                      >
                        Ver planos
                      </Link>
                    ) : bloqueio === 'compra' ? (
                      <button
                        type="button"
                        className="btn btn-accent h-9 flex-1 px-2 text-[13px]"
                        disabled
                        title="Venda de templates em breve"
                      >
                        Em breve
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-accent h-9 flex-1 px-2 text-[13px]"
                        disabled={!loja || ativo || salvando !== null}
                        onClick={() => void usar(t.chave)}
                      >
                        {salvando === t.chave
                          ? 'Aplicando…'
                          : ativo
                            ? 'Em uso'
                            : 'Usar'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {loja && visiveis.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">
            Nenhum template para esse tipo de loja ainda.
          </p>
        ) : null}
      </section>

      <p className="text-[13px] text-muted">
        Trocar de template não apaga nada: produtos, banners e cores ficam como
        estão. A fonte e o formato da foto passam a seguir o template; dá para
        ajustar depois em Loja e frete → Aparência.
      </p>
    </div>
  );
}
