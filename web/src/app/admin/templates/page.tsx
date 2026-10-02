'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import { LojaAoVivo } from '@/components/templates/LojaAoVivo';
import { MiniaturaTemplate } from '@/components/templates/MiniaturaTemplate';
import { PreviaTemplate } from '@/components/templates/PreviaTemplate';
import { precoTexto, SEGMENTOS, type TemplateItem } from '@/lib/templates';

/*
 * Templates da loja, no padrão da página de Temas da Shopify e de Layouts
 * da Nuvemshop: o template atual aparece com a loja de verdade (notebook e
 * celular), a biblioteca fica logo abaixo e cada template abre uma prévia
 * em tela cheia antes de aplicar.
 */

type Loja = {
  slug: string;
  name?: string;
  storeTheme?: string | null;
  accentColor?: string | null;
};

type Aba = 'todos' | 'gratis' | 'plano' | 'pago';

const ABAS: { key: Aba; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'gratis', label: 'Grátis' },
  { key: 'plano', label: 'Nos planos' },
  { key: 'pago', label: 'Premium' },
];

function selo(t: TemplateItem) {
  if (t.acesso === 'pago')
    return {
      texto: precoTexto(t.precoCentavos) || 'Premium',
      tom: 'bg-[#fff6e0] text-[#8a5a00]',
    };
  if (t.acesso === 'plano')
    return { texto: 'Nos planos', tom: 'bg-[#eef2ff] text-[#3b4cca]' };
  return { texto: 'Grátis', tom: 'bg-[#e8f6ee] text-[#166534]' };
}

export default function TemplatesPage() {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [lista, setLista] = useState<TemplateItem[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('todos');
  const [segmento, setSegmento] = useState('todos');
  const [previa, setPrevia] = useState<TemplateItem | null>(null);
  // Muda a cada troca de template, para a loja ao vivo recarregar
  const [versao, setVersao] = useState(0);

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

  const segmentos = useMemo(
    () =>
      SEGMENTOS.filter((s) => lista.some((t) => t.segmentos.includes(s.key))),
    [lista],
  );
  const contagem = (a: Aba) =>
    lista.filter((t) => a === 'todos' || t.acesso === a).length;
  const biblioteca = lista.filter(
    (t) =>
      t.chave !== atual &&
      (aba === 'todos' || t.acesso === aba) &&
      (segmento === 'todos' || t.segmentos.includes(segmento)),
  );

  async function usar(t: TemplateItem) {
    setSalvando(t.chave);
    setErro('');
    setAviso('');
    try {
      // Fonte e foto voltam ao "automático" para valer a sugestão do template
      const nova = await api<Loja>('/stores/me/branding', {
        method: 'PATCH',
        token: getToken(),
        storeSlug: getUser()?.store?.slug,
        body: { storeTheme: t.chave, storeFont: '', storeCardRatio: '' },
      });
      setLoja(nova);
      setVersao((v) => v + 1);
      setPrevia(null);
      setAviso(`Pronto: a sua loja agora usa o template ${t.nome}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível trocar o template',
      );
    } finally {
      setSalvando(null);
    }
  }

  /** O botão principal de cada template, conforme o acesso da loja */
  function BotaoUsar({
    t,
    grande = false,
  }: {
    t: TemplateItem;
    grande?: boolean;
  }) {
    const tamanho = grande ? 'h-10 px-4 text-[14px]' : 'h-9 px-3 text-[13px]';
    const bloqueio =
      t.liberacao && !t.liberacao.liberado ? t.liberacao.precisa : null;
    if (bloqueio === 'plano') {
      return (
        <Link
          href="/admin/settings/planos"
          className={`btn btn-accent ${tamanho}`}
        >
          Ver planos
        </Link>
      );
    }
    if (bloqueio === 'compra') {
      return (
        <button
          type="button"
          className={`btn btn-accent ${tamanho}`}
          disabled
          title="Venda de templates em breve"
        >
          Em breve
        </button>
      );
    }
    return (
      <button
        type="button"
        className={`btn btn-accent ${tamanho}`}
        disabled={salvando !== null}
        onClick={() => void usar(t)}
      >
        {salvando === t.chave
          ? 'Aplicando…'
          : grande
            ? 'Usar este template'
            : 'Usar'}
      </button>
    );
  }

  const urlLoja = (chave?: string) =>
    loja
      ? `/loja/${loja.slug}${chave ? `?tema=${chave}` : `?v=${versao}`}`
      : '';

  return (
    <div className="admin-page max-w-6xl">
      <CabecalhoPagina
        icone="/admin/templates"
        titulo="Templates da loja"
        descricao="O visual da sua vitrine. Troque quando quiser: produtos, banners, cor e logo continuam os mesmos."
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

      {/* Template atual: a loja de verdade, no computador e no celular */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative bg-[linear-gradient(160deg,#eef4f5,#e3ecee)] px-5 pb-6 pt-6 sm:px-8 sm:pb-8">
            {loja ? (
              <div className="relative mx-auto max-w-[620px] pr-[14%]">
                <div className="overflow-hidden rounded-t-[10px] border-[6px] border-b-0 border-[#1d2125] bg-[#1d2125] shadow-[0_24px_50px_-30px_rgba(13,58,67,0.6)]">
                  <div className="flex h-5 items-center gap-1 bg-[#2a2f35] px-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#e0603d]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#e0b23d]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4caf6e]" />
                  </div>
                  <LojaAoVivo
                    key={`pc-${versao}`}
                    src={urlLoja()}
                    largura={1280}
                    altura={800}
                    titulo="Sua loja no computador"
                  />
                </div>
                <div className="relative -mx-[3%] h-2.5 rounded-b-lg bg-gradient-to-b from-[#cfd5da] to-[#a9b1b8]" />
                <div className="absolute -bottom-3 right-0 w-[26%] overflow-hidden rounded-[22px] border-[5px] border-[#1d2125] bg-[#1d2125] shadow-[0_24px_40px_-24px_rgba(13,58,67,0.7)]">
                  <div className="overflow-hidden rounded-[16px]">
                    <LojaAoVivo
                      key={`cel-${versao}`}
                      src={urlLoja()}
                      largura={390}
                      altura={780}
                      titulo="Sua loja no celular"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto aspect-[16/10] max-w-[620px] animate-pulse rounded-lg bg-white/60" />
            )}
          </div>
          <div className="flex flex-col justify-center border-t border-line p-6 lg:border-l lg:border-t-0">
            <span className="w-fit rounded-full bg-[var(--brand-deep)] px-2.5 py-0.5 text-[12px] font-semibold text-white">
              Template atual
            </span>
            <h2 className="mt-3 font-[family-name:var(--font-brand)] text-[1.6rem] font-800 leading-tight tracking-tight">
              {emUso?.nome ?? 'Essencial'}
            </h2>
            {emUso?.paraQuem ? (
              <p className="mt-1 text-[13px] font-semibold text-[var(--brand-deep)]">
                {emUso.paraQuem}
              </p>
            ) : null}
            {emUso?.descricao ? (
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                {emUso.descricao}
              </p>
            ) : null}
            <div className="mt-5 grid gap-2">
              <Link
                href="/admin/settings"
                className="btn btn-accent h-10 text-[14px]"
              >
                Personalizar cores, logo e banner
              </Link>
              {loja ? (
                <a
                  href={`/loja/${loja.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost h-10 text-[14px]"
                >
                  Ver minha loja
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Biblioteca */}
      <section className="space-y-4">
        <div>
          <h2 className="text-[19px] font-bold">Biblioteca de templates</h2>
          <p className="mt-0.5 text-[14px] text-muted">
            Abra a prévia para ver a sua loja com o template antes de aplicar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <div
            className="-mb-px flex gap-1"
            role="tablist"
            aria-label="Tipo de acesso"
          >
            {ABAS.filter((a) => a.key === 'todos' || contagem(a.key) > 0).map(
              (a) => (
                <button
                  key={a.key}
                  type="button"
                  role="tab"
                  aria-selected={aba === a.key}
                  onClick={() => setAba(a.key)}
                  className={`border-b-2 px-3 pb-2.5 pt-1 text-[14px] font-semibold transition-colors ${
                    aba === a.key
                      ? 'border-[var(--brand-deep)] text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {a.label}{' '}
                  <span className="font-normal text-muted">
                    {contagem(a.key)}
                  </span>
                </button>
              ),
            )}
          </div>
          <label className="mb-2 flex items-center gap-2 text-[13px] text-muted">
            Tipo de loja
            <select
              className="field h-9 w-auto text-[13px]"
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
            >
              <option value="todos">Todos</option>
              {segmentos.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {biblioteca.map((t) => {
            const s = selo(t);
            return (
              <li key={t.chave} className="group flex flex-col">
                <div className="relative overflow-hidden rounded-xl ring-1 ring-line transition-shadow group-hover:shadow-[0_18px_36px_-24px_rgba(13,58,67,0.55)]">
                  <MiniaturaTemplate receita={t.receita} cor={cor} />
                  {/* Ações por cima da imagem, como na Nuvemshop */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0d3a43]/55 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      className="btn h-10 bg-white px-4 text-[14px] text-ink hover:bg-white/90"
                      onClick={() => setPrevia(t)}
                    >
                      Prévia
                    </button>
                    <BotaoUsar t={t} />
                  </div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold">{t.nome}</h3>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">
                      {t.paraQuem}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${s.tom}`}
                  >
                    {s.texto}
                  </span>
                </div>
                {/* No celular não existe "passar o mouse": botões sempre à vista */}
                <div className="mt-3 flex gap-2 sm:hidden">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 flex-1 text-[13px]"
                    onClick={() => setPrevia(t)}
                  >
                    Prévia
                  </button>
                  <BotaoUsar t={t} />
                </div>
              </li>
            );
          })}
        </ul>
        {loja && biblioteca.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">
            Nenhum template com esse filtro.
          </p>
        ) : null}
      </section>

      {previa && loja ? (
        <PreviaTemplate
          nome={previa.nome}
          src={urlLoja(previa.chave)}
          onFechar={() => setPrevia(null)}
          acao={<BotaoUsar t={previa} grande />}
        />
      ) : null}
    </div>
  );
}
