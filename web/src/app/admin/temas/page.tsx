'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import {
  resolveTheme,
  STORE_THEMES,
  type StoreThemeKey,
  type StoreThemeOption,
} from '@/lib/store-theme';

type Loja = {
  slug: string;
  storeTheme?: string | null;
  accentColor?: string | null;
};

/*
 * Miniatura desenhada do tema: cabeçalho, banner e quatro cartões com as
 * cores e a tipografia de cada um. Dá a ideia do clima sem depender de print.
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
  return (
    <div
      className="aspect-[16/11] w-full overflow-hidden"
      style={{ background: fundo, color: texto }}
      aria-hidden
    >
      {tema.key === 'street' ? (
        <div className="bg-black py-[3px] text-center text-[7px] font-bold uppercase tracking-widest text-white">
          Frete grátis · drop novo
        </div>
      ) : null}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: `1px solid ${tema.key === 'tech' ? '#263243' : '#0000001a'}`,
        }}
      >
        <span className="text-[11px] font-bold" style={{ fontFamily: fonte }}>
          Sua Loja
        </span>
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ background: cartao }}
        />
      </div>
      <div
        className={`mx-auto flex h-[30%] items-center px-3 ${
          tema.key === 'essencial' || tema.key === 'tech'
            ? 'mx-2 mt-2 rounded-md'
            : ''
        }`}
        style={{ background: cor }}
      >
        <span
          className="text-[13px] leading-none text-white"
          style={{
            fontFamily: fonte,
            textTransform: tema.key === 'street' ? 'uppercase' : undefined,
          }}
        >
          Nova coleção
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div
              className={`${tema.key === 'boutique' ? 'aspect-[2/3]' : 'aspect-square'} ${
                reto
                  ? ''
                  : tema.key === 'boutique'
                    ? 'rounded-[1px]'
                    : 'rounded-[4px]'
              }`}
              style={{
                background: tema.key === 'tech' ? '#ffffff' : cartao,
                outline: tema.key === 'tech' ? '1px solid #263243' : undefined,
              }}
            />
            <div
              className="mt-1 h-1 w-4/5 rounded-full opacity-40"
              style={{ background: texto }}
            />
            <div
              className="mt-0.5 h-1 w-1/2 rounded-full"
              style={{
                background: tema.key === 'tech' ? cor : texto,
                opacity: tema.key === 'tech' ? 1 : 0.7,
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
  const cor = loja?.accentColor || '#0d3a43';

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
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível trocar o tema',
      );
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="admin-page max-w-5xl">
      <CabecalhoPagina
        icone="/admin/temas"
        titulo="Temas da loja"
        descricao="Escolha o visual da sua vitrine. A cor e a logo continuam as suas; o tema muda fontes, cartões, banner e fundo. Veja a prévia antes de aplicar."
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

      <ul className="grid gap-4 sm:grid-cols-2">
        {STORE_THEMES.map((tema) => {
          const ativo = loja ? tema.key === atual : false;
          return (
            <li
              key={tema.key}
              className={`flex flex-col overflow-hidden rounded-2xl bg-white ${
                ativo
                  ? 'border-2 border-[var(--brand-deep)] shadow-[0_14px_30px_-22px_rgba(13,58,67,0.6)]'
                  : 'border border-line'
              }`}
            >
              <Miniatura tema={tema} cor={cor} />
              <div className="flex flex-1 flex-col border-t border-line p-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-bold">{tema.nome}</h2>
                  {ativo ? (
                    <span className="rounded-full bg-[#e9f1f3] px-2 py-0.5 text-[12px] font-semibold text-[var(--brand-deep)]">
                      Em uso
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[13px] font-semibold text-[var(--brand-deep)]">
                  {tema.paraQuem}
                </p>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">
                  {tema.descricao}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {loja ? (
                    <a
                      href={`/loja/${loja.slug}?tema=${tema.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost h-10 px-4 text-[14px]"
                    >
                      Ver prévia
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-accent h-10 px-4 text-[14px]"
                    disabled={!loja || ativo || salvando !== null}
                    onClick={() => void usar(tema.key)}
                  >
                    {salvando === tema.key
                      ? 'Aplicando…'
                      : ativo
                        ? 'Tema atual'
                        : 'Usar este tema'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[13px] text-muted">
        Trocar de tema não apaga nada: produtos, banners e cores ficam como
        estão. Fonte e formato da foto voltam ao padrão do tema; dá para ajustar
        depois em Loja e frete → Aparência.
      </p>
    </div>
  );
}
