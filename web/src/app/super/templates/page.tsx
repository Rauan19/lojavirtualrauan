'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { CabecalhoPagina } from '@/components/admin/Pagina';
import { Modal } from '@/components/Modal';
import { useConfirm } from '@/components/ConfirmDialog';
import { MiniaturaTemplate } from '@/components/templates/MiniaturaTemplate';
import { STORE_CARD_RATIOS, STORE_FONTS } from '@/lib/store-theme';
import {
  precoTexto,
  RECEITA_BASE,
  SEGMENTOS,
  type Acesso,
  type TemplateReceita,
} from '@/lib/templates';

type Linha = {
  chave: string;
  nome: string;
  paraQuem: string;
  descricao: string;
  segmentos: string[];
  receita: TemplateReceita;
  ativo: boolean;
  ordem: number;
  acesso: Acesso;
  planos: string[];
  precoCentavos: number | null;
  lojas: number;
  compras: number;
};

type Plano = { id: string; name: string; periodDays: number };

type Formulario = {
  novo: boolean;
  chave: string;
  nome: string;
  paraQuem: string;
  descricao: string;
  segmentos: string[];
  receita: TemplateReceita;
  acesso: Acesso;
  planos: string[];
  preco: string;
  ordem: string;
};

const COR_EXEMPLO = '#8e3a4f';

const ACESSO_LABEL: Record<Acesso, string> = {
  gratis: 'Grátis',
  plano: 'Incluso em planos',
  pago: 'Pago (venda única)',
};

function vazio(): Formulario {
  return {
    novo: true,
    chave: '',
    nome: '',
    paraQuem: '',
    descricao: '',
    segmentos: [],
    receita: { ...RECEITA_BASE },
    acesso: 'gratis',
    planos: [],
    preco: '',
    ordem: '100',
  };
}

function slug(t: string) {
  return t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 39);
}

/** Campo de cor: o seletor nativo e o código hex lado a lado */
function CampoCor({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input
        type="color"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-white p-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{rotulo}</span>
        <span className="font-mono text-[11px] text-muted">{valor}</span>
      </span>
    </label>
  );
}

function Opcoes<T extends string | number>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="label">{rotulo}</span>
      <div className="flex flex-wrap gap-1">
        {opcoes.map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={valor === v}
            className={`h-8 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${
              valor === v
                ? 'bg-[var(--brand-deep)] text-white'
                : 'border border-line bg-white hover:border-[var(--brand-teal)]'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SuperTemplatesPage() {
  const [lista, setLista] = useState<Linha[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirm, dialog } = useConfirm();

  const carregar = useCallback(async () => {
    const token = getToken();
    try {
      const [t, p] = await Promise.all([
        api<Linha[]>('/super/templates', { token }),
        api<Plano[]>('/billing/platform/plans', { token }).catch(() => []),
      ]);
      setLista(t);
      setPlanos(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function editar(t: Linha, duplicar = false) {
    setErro('');
    setForm({
      novo: duplicar,
      chave: duplicar ? `${t.chave}-copia` : t.chave,
      nome: duplicar ? `${t.nome} (cópia)` : t.nome,
      paraQuem: t.paraQuem,
      descricao: t.descricao,
      segmentos: t.segmentos,
      receita: { ...t.receita },
      acesso: t.acesso,
      planos: t.planos,
      preco: t.precoCentavos != null ? String(t.precoCentavos / 100) : '',
      ordem: String(duplicar ? t.ordem + 1 : t.ordem),
    });
  }

  function receita<K extends keyof TemplateReceita>(
    k: K,
    v: TemplateReceita[K],
  ) {
    setForm((f) => (f ? { ...f, receita: { ...f.receita, [k]: v } } : f));
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro('');
    const preco = form.preco.trim()
      ? Math.round(Number(form.preco.replace(',', '.')) * 100)
      : null;
    const corpo = {
      nome: form.nome,
      paraQuem: form.paraQuem,
      descricao: form.descricao,
      segmentos: form.segmentos,
      receita: form.receita,
      acesso: form.acesso,
      planos: form.acesso === 'gratis' ? [] : form.planos,
      precoCentavos: form.acesso === 'pago' ? preco : null,
      ordem: Number(form.ordem) || 100,
    };
    try {
      if (form.novo) {
        await api('/super/templates', {
          method: 'POST',
          token: getToken(),
          body: { ...corpo, chave: form.chave },
        });
        setAviso(
          `Template ${form.nome} criado. Ele nasce desativado: confira a prévia e ative.`,
        );
      } else {
        await api(`/super/templates/${form.chave}`, {
          method: 'PATCH',
          token: getToken(),
          body: corpo,
        });
        setAviso(`Template ${form.nome} salvo.`);
      }
      setForm(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(t: Linha) {
    setErro('');
    try {
      await api(`/super/templates/${t.chave}`, {
        method: 'PATCH',
        token: getToken(),
        body: { ativo: !t.ativo },
      });
      setAviso(
        t.ativo
          ? `${t.nome} desativado: some da galeria das lojas.`
          : `${t.nome} ativado.`,
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mudar');
    }
  }

  async function excluir(t: Linha) {
    const ok = await confirm({
      title: `Excluir o template ${t.nome}?`,
      message:
        t.lojas > 0
          ? `${t.lojas} loja(s) usam este template e voltam para o Essencial. Não dá para desfazer.`
          : 'Nenhuma loja usa este template. Não dá para desfazer.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/super/templates/${t.chave}`, {
        method: 'DELETE',
        token: getToken(),
      });
      setAviso(`Template ${t.nome} excluído.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir');
    }
  }

  const ativos = lista.filter((t) => t.ativo).length;

  return (
    <div className="admin-page">
      {dialog}
      <CabecalhoPagina
        icone="/super/templates"
        titulo="Templates"
        descricao="Templates prontos que os lojistas escolhem para a vitrine. Template é uma receita (cores, cartões, banner, fonte): dá para criar e mudar aqui, sem programação."
        acoes={
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              setErro('');
              setForm(vazio());
            }}
          >
            + Novo template
          </button>
        }
      />

      {erro && !form ? (
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

      <p className="-mb-2 text-[13px] text-muted">
        {carregando
          ? 'Carregando…'
          : `${lista.length} templates · ${ativos} ativos para as lojas`}
      </p>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((t) => (
          <li
            key={t.chave}
            className={`flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-line ${
              t.ativo ? '' : 'opacity-70'
            }`}
          >
            <div className="relative">
              <MiniaturaTemplate receita={t.receita} cor={COR_EXEMPLO} />
              <span
                className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  t.ativo
                    ? 'bg-[#e8f6ee] text-[#166534]'
                    : 'bg-[#f0f1f3] text-[#5c6570]'
                }`}
              >
                {t.ativo ? 'Ativo' : 'Desativado'}
              </span>
            </div>
            <div className="flex flex-1 flex-col border-t border-line p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-[15px] font-bold">{t.nome}</h3>
                <code className="shrink-0 text-[11px] text-muted">
                  {t.chave}
                </code>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">
                {t.paraQuem}
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-[#e9f1f3] px-2 py-0.5 font-semibold text-[var(--brand-deep)]">
                  {t.acesso === 'pago'
                    ? precoTexto(t.precoCentavos) || 'Pago'
                    : ACESSO_LABEL[t.acesso]}
                </span>
                <span className="rounded-full bg-[#f0f1f3] px-2 py-0.5 font-semibold text-[#5c6570]">
                  {t.lojas} loja{t.lojas === 1 ? '' : 's'}
                </span>
                {t.compras > 0 ? (
                  <span className="rounded-full bg-[#fff6e0] px-2 py-0.5 font-semibold text-[#8a5a00]">
                    {t.compras} compra{t.compras === 1 ? '' : 's'}
                  </span>
                ) : null}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2 text-[12.5px]"
                  onClick={() => editar(t)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2 text-[12.5px]"
                  disabled={t.chave === 'essencial'}
                  onClick={() => void alternar(t)}
                >
                  {t.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2 text-[12.5px]"
                  onClick={() => editar(t, true)}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2 text-[12.5px] text-[#b42318]"
                  disabled={t.chave === 'essencial'}
                  onClick={() => void excluir(t)}
                >
                  Excluir
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {form ? (
        <Modal
          title={form.novo ? 'Novo template' : `Editar ${form.nome}`}
          hint="A miniatura mostra o resultado enquanto você mexe. Depois de salvar, confira na prévia de uma loja."
          erro={erro}
          largura="lg"
          onClose={() => setForm(null)}
        >
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-5">
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-1 text-[14px] font-semibold">
                  Identificação
                </legend>
                <div>
                  <label className="label" htmlFor="tpl-nome">
                    Nome
                  </label>
                  <input
                    id="tpl-nome"
                    className="field"
                    value={form.nome}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        nome: e.target.value,
                        ...(form.novo ? { chave: slug(e.target.value) } : {}),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="tpl-chave">
                    Chave (endereço da prévia)
                  </label>
                  <input
                    id="tpl-chave"
                    className="field font-mono text-[13px]"
                    value={form.chave}
                    disabled={!form.novo}
                    onChange={(e) =>
                      setForm({ ...form, chave: slug(e.target.value) })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="tpl-para">
                    Para que loja
                  </label>
                  <input
                    id="tpl-para"
                    className="field"
                    value={form.paraQuem}
                    placeholder="Ex.: Moda, acessórios, beleza"
                    onChange={(e) =>
                      setForm({ ...form, paraQuem: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="tpl-desc">
                    Descrição
                  </label>
                  <input
                    id="tpl-desc"
                    className="field"
                    value={form.descricao}
                    onChange={(e) =>
                      setForm({ ...form, descricao: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="label">
                    Tipos de loja (filtros da galeria)
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {SEGMENTOS.map((s) => {
                      const on = form.segmentos.includes(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setForm({
                              ...form,
                              segmentos: on
                                ? form.segmentos.filter((x) => x !== s.key)
                                : [...form.segmentos, s.key],
                            })
                          }
                          className={`h-8 rounded-full px-3 text-[12.5px] font-semibold ${
                            on
                              ? 'bg-[var(--brand-deep)] text-white'
                              : 'border border-line bg-white'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </fieldset>

              <fieldset className="grid gap-3">
                <legend className="mb-1 text-[14px] font-semibold">
                  Quem pode usar
                </legend>
                <Opcoes
                  rotulo="Acesso"
                  valor={form.acesso}
                  opcoes={[
                    ['gratis', 'Grátis'],
                    ['plano', 'Incluso em planos'],
                    ['pago', 'Pago (venda única)'],
                  ]}
                  onChange={(v) => setForm({ ...form, acesso: v })}
                />
                {form.acesso !== 'gratis' ? (
                  <div>
                    <span className="label">
                      {form.acesso === 'plano'
                        ? 'Planos que incluem'
                        : 'Planos em que já vem incluso (opcional)'}
                    </span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {planos.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-1.5 text-[13px]"
                        >
                          <input
                            type="checkbox"
                            checked={form.planos.includes(p.id)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                planos: e.target.checked
                                  ? [...form.planos, p.id]
                                  : form.planos.filter((x) => x !== p.id),
                              })
                            }
                          />
                          {p.name}
                          {p.periodDays >= 360 ? ' (anual)' : ''}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                {form.acesso === 'pago' ? (
                  <div className="max-w-[200px]">
                    <label className="label" htmlFor="tpl-preco">
                      Preço (R$)
                    </label>
                    <input
                      id="tpl-preco"
                      className="field"
                      inputMode="decimal"
                      value={form.preco}
                      placeholder="299,00"
                      onChange={(e) =>
                        setForm({ ...form, preco: e.target.value })
                      }
                    />
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-1 text-[14px] font-semibold">
                  Cores
                </legend>
                <CampoCor
                  rotulo="Fundo"
                  valor={form.receita.fundo}
                  onChange={(v) => receita('fundo', v)}
                />
                <CampoCor
                  rotulo="Superfície (cabeçalho)"
                  valor={form.receita.superficie}
                  onChange={(v) => receita('superficie', v)}
                />
                <CampoCor
                  rotulo="Texto"
                  valor={form.receita.texto}
                  onChange={(v) => receita('texto', v)}
                />
                <CampoCor
                  rotulo="Texto suave"
                  valor={form.receita.textoSuave}
                  onChange={(v) => receita('textoSuave', v)}
                />
                <CampoCor
                  rotulo="Linhas"
                  valor={form.receita.linha}
                  onChange={(v) => receita('linha', v)}
                />
                <CampoCor
                  rotulo="Fundo da foto"
                  valor={form.receita.corCartao}
                  onChange={(v) => receita('corCartao', v)}
                />
                <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.receita.escuro}
                    onChange={(e) => receita('escuro', e.target.checked)}
                  />
                  Template escuro (fotos ficam em fundo branco)
                </label>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-1 text-[14px] font-semibold">
                  Estilo
                </legend>
                <Opcoes
                  rotulo="Faixa de avisos"
                  valor={form.receita.faixa}
                  opcoes={[
                    ['loja', 'Cor da loja'],
                    ['preta', 'Preta'],
                    ['destaque', 'Destaque'],
                  ]}
                  onChange={(v) => receita('faixa', v)}
                />
                <Opcoes
                  rotulo="Banner"
                  valor={form.receita.banner}
                  opcoes={[
                    ['caixa', 'Em caixa'],
                    ['cheio', 'Ponta a ponta'],
                  ]}
                  onChange={(v) => receita('banner', v)}
                />
                <Opcoes
                  rotulo="Cartão do produto"
                  valor={form.receita.cartao}
                  opcoes={[
                    ['simples', 'Simples'],
                    ['contorno', 'Contorno'],
                    ['preenchido', 'Preenchido'],
                  ]}
                  onChange={(v) => receita('cartao', v)}
                />
                <Opcoes
                  rotulo="Cantos"
                  valor={form.receita.cantos}
                  opcoes={[
                    ['retos', 'Retos'],
                    ['suaves', 'Suaves'],
                    ['redondos', 'Redondos'],
                  ]}
                  onChange={(v) => receita('cantos', v)}
                />
                <Opcoes
                  rotulo="Título das seções"
                  valor={form.receita.tituloCaixa}
                  opcoes={[
                    ['normal', 'Normal'],
                    ['alta', 'CAIXA ALTA'],
                  ]}
                  onChange={(v) => receita('tituloCaixa', v)}
                />
                <Opcoes
                  rotulo="Alinhamento do título"
                  valor={form.receita.tituloAlinhamento}
                  opcoes={[
                    ['esquerda', 'Esquerda'],
                    ['centro', 'Centro'],
                  ]}
                  onChange={(v) => receita('tituloAlinhamento', v)}
                />
                <Opcoes
                  rotulo="Peso do título"
                  valor={form.receita.tituloPeso}
                  opcoes={[
                    [400, 'Leve'],
                    [500, 'Médio'],
                    [600, 'Semi'],
                    [700, 'Negrito'],
                    [800, 'Forte'],
                  ]}
                  onChange={(v) => receita('tituloPeso', v)}
                />
                <Opcoes
                  rotulo="Nome do produto"
                  valor={form.receita.nomeProduto}
                  opcoes={[
                    ['normal', 'Normal'],
                    ['caixa-alta', 'CAIXA ALTA'],
                  ]}
                  onChange={(v) => receita('nomeProduto', v)}
                />
                <Opcoes
                  rotulo="Produtos por linha (computador)"
                  valor={form.receita.colunas}
                  opcoes={[
                    [3, '3'],
                    [4, '4'],
                    [5, '5'],
                    [6, '6'],
                  ]}
                  onChange={(v) => receita('colunas', v)}
                />
                <Opcoes
                  rotulo="Botão de comprar"
                  valor={form.receita.compraRapida}
                  opcoes={[
                    ['passar-mouse', 'Ao passar o mouse'],
                    ['sempre', 'Sempre visível'],
                  ]}
                  onChange={(v) => receita('compraRapida', v)}
                />
                <div>
                  <label className="label" htmlFor="tpl-fonte">
                    Fonte
                  </label>
                  <select
                    id="tpl-fonte"
                    className="field"
                    value={form.receita.fonte ?? ''}
                    onChange={(e) =>
                      receita(
                        'fonte',
                        (e.target.value || null) as TemplateReceita['fonte'],
                      )
                    }
                  >
                    <option value="">Pelo ramo da loja</option>
                    {STORE_FONTS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="tpl-foto">
                    Formato da foto
                  </label>
                  <select
                    id="tpl-foto"
                    className="field"
                    value={form.receita.foto ?? ''}
                    onChange={(e) =>
                      receita(
                        'foto',
                        (e.target.value || null) as TemplateReceita['foto'],
                      )
                    }
                  >
                    <option value="">Pelo ramo da loja</option>
                    {STORE_CARD_RATIOS.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={form.receita.precoNaCor}
                    onChange={(e) => receita('precoNaCor', e.target.checked)}
                  />
                  Preço na cor da loja
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={form.receita.precoFonteTitulo}
                    onChange={(e) =>
                      receita('precoFonteTitulo', e.target.checked)
                    }
                  />
                  Preço na fonte do título
                </label>
                <div className="max-w-[140px]">
                  <label className="label" htmlFor="tpl-ordem">
                    Ordem na galeria
                  </label>
                  <input
                    id="tpl-ordem"
                    className="field"
                    inputMode="numeric"
                    value={form.ordem}
                    onChange={(e) =>
                      setForm({ ...form, ordem: e.target.value })
                    }
                  />
                </div>
              </fieldset>
            </div>

            <div className="md:sticky md:top-0 md:self-start">
              <span className="label">Miniatura</span>
              <div className="overflow-hidden rounded-xl ring-1 ring-line">
                <MiniaturaTemplate receita={form.receita} cor={COR_EXEMPLO} />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Cor de exemplo; na loja entra a cor do lojista.
              </p>
              {!form.novo ? (
                <a
                  href={`/loja/atelie-lua?tema=${form.chave}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost mt-3 h-9 w-full text-[13px]"
                >
                  Prévia numa loja (salvo)
                </a>
              ) : null}
              <button
                type="button"
                className="btn btn-accent mt-3 h-10 w-full"
                disabled={
                  salvando ||
                  form.nome.trim().length < 2 ||
                  form.chave.length < 2
                }
                onClick={() => void salvar()}
              >
                {salvando
                  ? 'Salvando…'
                  : form.novo
                    ? 'Criar template'
                    : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
