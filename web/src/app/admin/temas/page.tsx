'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import {
  resolveTheme,
  SEGMENTOS,
  STORE_THEMES,
  type Segmento,
  type StoreThemeKey,
  type StoreThemeOption,
} from '@/lib/store-theme';

type Loja = {
  slug: string;
  storeTheme?: string | null;
  accentColor?: string | null;
};

/*
 * Miniatura desenhada do tema: cabeçalho, banner e cartões com as cores e a
 * tipografia de cada um. Dá a ideia do clima sem depender de print.
 */
function Miniatura({ tema, cor }: { tema: StoreThemeOption; cor: string }) {
  const { fundo, cartao, texto, titulo } = tema.mini;
  const fonte =
    titulo === 'serif'
      ? 'var(--font-store-elegant), Georgia, serif'
      : titulo === 'impacto'
        ? 'var(--font-store-impact), Impact, sans-serif'
        : 'var(--font-display), sans-serif';
  const reto = tema.key === 'street';
  const escuro = tema.key === 'tech';
  return (
    <div
      className="flex aspect-[4/3] w-full flex-col overflow-hidden"
      style={{ background: fundo, color: texto }}
      aria-hidden
    >
      {tema.key === 'street' ? (
        <div className="bg-black py-[3px] text-center text-[7px] font-bold uppercase tracking-widest text-white">
          Frete grátis · drop novo
        </div>
      ) : null}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          borderBottom: `1px solid ${escuro ? '#263243' : '#0000001a'}`,
        }}
      >
        <span className="text-[10px] font-bold" style={{ fontFamily: fonte }}>
          Sua Loja
        </span>
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ background: cartao }}
        />
      </div>
      <div
        className={`flex h-[30%] shrink-0 items-center px-3 ${
          tema.key === 'essencial' || escuro ? 'mx-2 mt-2 rounded-md' : ''
        }`}
        style={{ background: cor }}
      >
        <span
          className="text-[12px] leading-none text-white"
          style={{
            fontFamily: fonte,
            textTransform: reto ? 'uppercase' : undefined,
          }}
        >
          Nova coleção
        </span>
      </div>
      <div className="grid flex-1 grid-cols-4 gap-1.5 p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-0 flex-col">
            <div
              className={`min-h-0 flex-1 ${
                reto
                  ? ''
                  : tema.key === 'boutique'
                    ? 'rounded-[1px]'
                    : 'rounded-[4px]'
              }`}
              style={{
                background: escuro ? '#ffffff' : cartao,
                outline: escuro ? '1px solid #263243' : undefined,
              }}
            />
            <div
              className="mt-1 h-1 w-4/5 rounded-full opacity-40"
              style={{ background: texto }}
            />
            <div
              className="mt-0.5 h-1 w-1/2 rounded-full"
              style={{
                background: escuro ? cor : texto,
                opacity: escuro ? 1 : 0.7,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TemasPage() {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState<StoreThemeKey | null>(null);
  const [filtro, setFiltro] = useState<Segmento | 'todos'>('todos');

  useEffect(() => {
    api<Loja>('/stores/me', {
      token: getToken(),
      storeSlug: getUser()?.store?.slug,
    })
      .then(setLoja)
      .catch((e) =>
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar'),
      );
  }, []);

  const atual = resolveTheme(loja?.storeTheme);
  const temaAtual = STORE_THEMES.find((t) => t.key === atual)!;
  const cor = loja?.accentColor || '#0d3a43';
  const lista = STORE_THEMES.filter(
    (t) => filtro === 'todos' || t.segmentos.includes(filtro),
  );

  async function usar(tema: StoreThemeKey) {
    setSalvando(tema);
    setErro('');
    setAviso('');
    try {
      // Fonte e foto voltam ao "automático" para valer a sugestão do tema
      const nova = await api<Loja>('/stores/me/branding', {
        method: 'PATCH',
        token: getToken(),
        storeSlug: getUser()?.store?.slug,
        body: { storeTheme: tema, storeFont: '', storeCardRatio: '' },
      });
      setLoja(nova);
      setAviso(
        `Tema ${STORE_THEMES.find((t) => t.key === tema)?.nome} aplicado na sua loja.`,
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível trocar o tema',
      );
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="admin-page max-w-6xl">
      <CabecalhoPagina
        icone="/admin/temas"
        titulo="Temas da loja"
        descricao="Escolha o visual da sua vitrine. Sua cor e sua logo continuam; o tema muda fontes, cartões, banner e fundo."
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

      {/* Tema em uso, sempre à vista no topo */}
      {loja ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center">
          <div className="w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-line sm:w-52">
            <Miniatura tema={temaAtual} cor={cor} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-muted">Tema em uso</p>
            <h2 className="text-[20px] font-bold leading-tight">
              {temaAtual.nome}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              {temaAtual.descricao}
            </p>
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
            <a
              href="/admin/settings"
              className="btn btn-ghost h-10 px-4 text-[14px]"
            >
              Ajustar cores e fonte
            </a>
          </div>
        </section>
      ) : null}

      {/* Galeria */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold">Todos os temas</h2>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filtrar por tipo de loja"
          >
            {[{ key: 'todos' as const, label: 'Todos' }, ...SEGMENTOS].map(
              (s) => (
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
              ),
            )}
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((tema) => {
            const ativo = loja ? tema.key === atual : false;
            return (
              <li
                key={tema.key}
                className={`flex flex-col overflow-hidden rounded-2xl bg-white transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(13,58,67,0.55)] ${
                  ativo ? 'ring-2 ring-[var(--brand-deep)]' : 'ring-1 ring-line'
                }`}
              >
                <div className="relative">
                  <Miniatura tema={tema} cor={cor} />
                  {ativo ? (
                    <span className="absolute right-2 top-2 rounded-full bg-[var(--brand-deep)] px-2 py-0.5 text-[11px] font-semibold text-white">
                      Em uso
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col border-t border-line p-3.5">
                  <h3 className="text-[15px] font-bold">{tema.nome}</h3>
                  <p className="mt-0.5 line-clamp-2 flex-1 text-[12.5px] leading-snug text-muted">
                    {tema.paraQuem}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {loja ? (
                      <a
                        href={`/loja/${loja.slug}?tema=${tema.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost h-9 flex-1 px-2 text-[13px]"
                      >
                        Prévia
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-accent h-9 flex-1 px-2 text-[13px]"
                      disabled={!loja || ativo || salvando !== null}
                      onClick={() => void usar(tema.key)}
                    >
                      {salvando === tema.key
                        ? 'Aplicando…'
                        : ativo
                          ? 'Em uso'
                          : 'Usar'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {lista.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">
            Nenhum tema para esse tipo de loja ainda.
          </p>
        ) : null}
      </section>

      <p className="text-[13px] text-muted">
        Trocar de tema não apaga nada: produtos, banners e cores ficam como
        estão. A fonte e o formato da foto passam a seguir o tema; dá para
        ajustar depois em Loja e frete → Aparência.
      </p>
    </div>
  );
}
