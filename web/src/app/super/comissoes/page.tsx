'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { PaginationBar } from '@/components/PaginationBar';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { CabecalhoPagina, Selo } from '@/components/admin/Pagina';

type Liberacao = 'geral' | 'ligada' | 'desligada';
type Filtro = 'movimento' | 'taxa' | 'todas';
type Ordem = 'liquido' | 'vendas' | 'nome';

type LinhaLoja = {
  storeId: string;
  nome: string;
  slug: string;
  status: string;
  plano: string;
  feeBps: number;
  conectado: boolean;
  liberacao: Liberacao;
  cobradoCents: number;
  devolvidoCents: number;
  liquidoCents: number;
  pedidos: number;
};

type Pagina<T> = {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
};

type Resumo = {
  mes: string;
  geral: { ligadaNoGeral: boolean; prazoConexao: string | null };
  totais: {
    cobradoCents: number;
    devolvidoCents: number;
    liquidoCents: number;
    pedidos: number;
  };
  mesAnterior: { mes: string; liquidoCents: number };
  lojasComMovimento: number;
  divergenciasTotal: number;
};

type Divergencia = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  mpPaymentId: string | null;
  esperadoCents: number;
  retidoCents: number;
  loja: string;
};

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const pct = (bps: number) => `${String(bps / 100).replace('.', ',')}%`;

function mesAtual() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function somarMes(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-10" → "outubro de 2026" (maiúscula só quando abre a frase). */
function nomeDoMes(mes: string, inicial = false) {
  const [a, m] = mes.split('-').map(Number);
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return inicial ? nome.charAt(0).toUpperCase() + nome.slice(1) : nome;
}

/** Valor do <select> → corpo do PATCH. */
const VALOR: Record<Liberacao, boolean | null> = {
  geral: null,
  ligada: true,
  desligada: false,
};

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'movimento', rotulo: 'Com movimento' },
  { id: 'taxa', rotulo: 'Plano com taxa' },
  { id: 'todas', rotulo: 'Todas' },
];

/** Estado da tela na URL: dá para recarregar e mandar o link. */
function lerUrl() {
  const q = new URLSearchParams(window.location.search);
  const mes = q.get('mes');
  const filtro = q.get('filtro') as Filtro | null;
  const ordem = q.get('ordem') as Ordem | null;
  return {
    mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : mesAtual(),
    filtro: filtro && FILTROS.some((f) => f.id === filtro) ? filtro : null,
    ordem:
      ordem && ['liquido', 'vendas', 'nome'].includes(ordem) ? ordem : null,
    busca: q.get('busca') ?? '',
    pagina: Math.max(1, Number(q.get('pagina')) || 1),
    porPagina: [25, 50, 100].includes(Number(q.get('porPagina')))
      ? Number(q.get('porPagina'))
      : 25,
  };
}

export default function SuperComissoesPage() {
  const { confirm, dialog } = useConfirm();
  const [pronto, setPronto] = useState(false);
  const [mes, setMes] = useState(mesAtual);
  const [filtro, setFiltro] = useState<Filtro>('movimento');
  const [ordem, setOrdem] = useState<Ordem>('liquido');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lojas, setLojas] = useState<Pagina<LinhaLoja> | null>(null);
  const [carregandoLojas, setCarregandoLojas] = useState(true);
  const [divergencias, setDivergencias] = useState<Pagina<Divergencia> | null>(
    null,
  );
  const [paginaDiv, setPaginaDiv] = useState(1);
  const [verDivergencias, setVerDivergencias] = useState(false);
  const [erro, setErro] = useState('');

  // Lê a URL uma vez, no navegador
  useEffect(() => {
    const u = lerUrl();
    setMes(u.mes);
    if (u.filtro) setFiltro(u.filtro);
    if (u.ordem) setOrdem(u.ordem);
    setBusca(u.busca);
    setBuscaAplicada(u.busca);
    setPagina(u.pagina);
    setPorPagina(u.porPagina);
    setPronto(true);
  }, []);

  // Busca só depois de parar de digitar (e volta para a página 1)
  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(() => {
      if (busca.trim() !== buscaAplicada) {
        setBuscaAplicada(busca.trim());
        setPagina(1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [busca, buscaAplicada, pronto]);

  // Mantém a URL igual à tela
  useEffect(() => {
    if (!pronto) return;
    const q = new URLSearchParams();
    if (mes !== mesAtual()) q.set('mes', mes);
    if (filtro !== 'movimento') q.set('filtro', filtro);
    if (ordem !== 'liquido') q.set('ordem', ordem);
    if (buscaAplicada) q.set('busca', buscaAplicada);
    if (pagina > 1) q.set('pagina', String(pagina));
    if (porPagina !== 25) q.set('porPagina', String(porPagina));
    const qs = q.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    );
  }, [pronto, mes, filtro, ordem, buscaAplicada, pagina, porPagina]);

  const carregarResumo = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setResumo(
        await api<Resumo>(`/platform-fee/relatorio?mes=${mes}`, { token }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    }
  }, [mes]);

  // Só a resposta da última busca vale (digitar rápido não embaralha a lista)
  const pedidoAtual = useRef(0);
  const carregarLojas = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const n = ++pedidoAtual.current;
    setCarregandoLojas(true);
    const q = new URLSearchParams({
      mes,
      filtro,
      ordem,
      pagina: String(pagina),
      porPagina: String(porPagina),
    });
    if (buscaAplicada) q.set('busca', buscaAplicada);
    try {
      const r = await api<Pagina<LinhaLoja>>(
        `/platform-fee/relatorio/lojas?${q}`,
        { token },
      );
      if (n !== pedidoAtual.current) return;
      setLojas(r);
      // A API corrige página fora do intervalo (ex.: filtro com menos lojas)
      if (r.pagina !== pagina) setPagina(r.pagina);
    } catch (e) {
      if (n === pedidoAtual.current)
        setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      if (n === pedidoAtual.current) setCarregandoLojas(false);
    }
  }, [mes, filtro, ordem, pagina, porPagina, buscaAplicada]);

  const carregarDivergencias = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setDivergencias(
        await api<Pagina<Divergencia>>(
          `/platform-fee/divergencias?pagina=${paginaDiv}&porPagina=10`,
          { token },
        ),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    }
  }, [paginaDiv]);

  useEffect(() => {
    if (pronto) void carregarResumo();
  }, [pronto, carregarResumo]);

  useEffect(() => {
    if (pronto) void carregarLojas();
  }, [pronto, carregarLojas]);

  useEffect(() => {
    if (verDivergencias) void carregarDivergencias();
  }, [verDivergencias, carregarDivergencias]);

  function trocarMes(novo: string) {
    if (!novo || novo > mesAtual()) return;
    setMes(novo);
    setPagina(1);
  }

  async function baixarCsv() {
    const token = getToken();
    if (!token) return;
    setErro('');
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${base}/platform-fee/relatorio.csv?mes=${mes}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Não foi possível gerar o CSV');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `comissoes-${mes}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao baixar');
    }
  }

  async function mudarLiberacao(loja: LinhaLoja, nova: Liberacao) {
    if (nova === loja.liberacao) return;
    if (nova === 'ligada' && !loja.conectado) {
      const ok = await confirm({
        title: 'Loja sem Mercado Pago conectado',
        message:
          'Sem a conexão, a comissão não é cobrada (e, depois do prazo, a loja deixa de receber pagamentos). Ligar mesmo assim?',
        confirmLabel: 'Ligar',
      });
      if (!ok) return;
    }
    const token = getToken();
    if (!token) return;
    try {
      await api(`/platform-fee/lojas/${loja.storeId}`, {
        method: 'PATCH',
        token,
        body: { platformFeeEnabled: VALOR[nova] },
      });
      setLojas((d) =>
        d
          ? {
              ...d,
              itens: d.itens.map((l) =>
                l.storeId === loja.storeId ? { ...l, liberacao: nova } : l,
              ),
            }
          : d,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar');
    }
  }

  async function resolver(orderId: string) {
    const ok = await confirm({
      title: 'Marcar como conferida?',
      message:
        'Use depois de conferir no Mercado Pago o valor retido. O pedido sai da lista.',
      confirmLabel: 'Conferida',
    });
    if (!ok) return;
    const token = getToken();
    if (!token) return;
    try {
      await api(`/platform-fee/divergencias/${orderId}/resolver`, {
        method: 'POST',
        token,
      });
      await Promise.all([carregarDivergencias(), carregarResumo()]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar');
    }
  }

  const t = resumo?.totais;
  const variacao =
    resumo && resumo.mesAnterior.liquidoCents !== 0
      ? ((resumo.totais.liquidoCents - resumo.mesAnterior.liquidoCents) /
          Math.abs(resumo.mesAnterior.liquidoCents)) *
        100
      : null;
  const primeira = lojas ? (lojas.pagina - 1) * lojas.porPagina + 1 : 0;
  const ultima = lojas ? primeira + lojas.itens.length - 1 : 0;

  return (
    <div className="admin-page max-w-6xl">
      {dialog}
      <CabecalhoPagina
        icone="/super/comissoes"
        titulo="Comissões"
        descricao="O que o Mercado Pago reteve para a plataforma em cada venda, por loja. Base para a nota fiscal do mês."
        acoes={
          <>
            <div
              className="flex items-center rounded-lg border border-line bg-white"
              role="group"
              aria-label="Mês do relatório"
            >
              <button
                type="button"
                className="h-10 px-3 text-muted hover:text-ink"
                onClick={() => trocarMes(somarMes(mes, -1))}
                aria-label="Mês anterior"
              >
                ‹
              </button>
              <input
                type="month"
                className="h-10 border-x border-line bg-transparent px-2 text-sm font-semibold"
                value={mes}
                max={mesAtual()}
                onChange={(e) => trocarMes(e.target.value)}
                aria-label="Mês"
              />
              <button
                type="button"
                className="h-10 px-3 text-muted hover:text-ink disabled:opacity-30"
                onClick={() => trocarMes(somarMes(mes, 1))}
                disabled={mes >= mesAtual()}
                aria-label="Próximo mês"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost h-10"
              onClick={() => void baixarCsv()}
            >
              Baixar CSV
            </button>
          </>
        }
      />

      {erro ? (
        <p
          role="alert"
          className="rounded-xl border border-[#f3b3b3] bg-[#fef2f2] px-4 py-3 text-sm text-[#b42318]"
        >
          {erro}
        </p>
      ) : null}

      {resumo ? (
        <p
          className={`rounded-xl border px-4 py-2.5 text-[13px] ${
            resumo.geral.ligadaNoGeral
              ? 'border-[#bfe3c8] bg-[#f0fbf3] text-[#166534]'
              : 'border-[#f0d998] bg-[#fff8e1] text-[#6b4f00]'
          }`}
        >
          <strong>
            {resumo.geral.ligadaNoGeral
              ? 'Cobrança ligada para todas as lojas'
              : 'Cobrança desligada no geral'}
          </strong>
          {resumo.geral.ligadaNoGeral
            ? ' (exceto as marcadas como desligada).'
            : ': só as lojas marcadas como "ligada" pagam comissão. Use para liberar aos poucos.'}
          {resumo.geral.prazoConexao
            ? ` Prazo para conectar o Mercado Pago: ${new Date(resumo.geral.prazoConexao).toLocaleDateString('pt-BR')}.`
            : ''}
        </p>
      ) : null}

      {/* Resumo do mês */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl bg-[var(--brand-deep)] px-5 py-4 text-white sm:col-span-2">
          <p className="text-[13px] font-medium text-white/75">
            Líquido · {nomeDoMes(mes)}
          </p>
          <p className="mt-1 text-[2rem] font-bold leading-tight tabular-nums">
            {t ? reais(t.liquidoCents) : '…'}
          </p>
          <p className="mt-1 text-xs text-white/75">
            {resumo
              ? variacao === null
                ? `Sem comissão em ${nomeDoMes(resumo.mesAnterior.mes)}`
                : `${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre ${nomeDoMes(resumo.mesAnterior.mes)} (${reais(resumo.mesAnterior.liquidoCents)})`
              : ' '}
          </p>
        </div>
        {(
          [
            ['Cobrado', t ? reais(t.cobradoCents) : '…', 'cobranças do mês'],
            [
              'Devolvido',
              t ? reais(t.devolvidoCents) : '…',
              'estornos e chargebacks',
            ],
            [
              'Vendas com taxa',
              t ? t.pedidos.toLocaleString('pt-BR') : '…',
              resumo
                ? `em ${resumo.lojasComMovimento.toLocaleString('pt-BR')} ${resumo.lojasComMovimento === 1 ? 'loja' : 'lojas'}`
                : ' ',
            ],
          ] as const
        ).map(([rotulo, valor, detalhe]) => (
          <div
            key={rotulo}
            className="rounded-2xl border border-line bg-white px-5 py-4"
          >
            <p className="text-[13px] font-medium text-muted">{rotulo}</p>
            <p className="mt-1 text-[1.35rem] font-bold leading-tight tabular-nums">
              {valor}
            </p>
            <p className="mt-1 text-xs text-muted">{detalhe}</p>
          </div>
        ))}
      </section>

      {/* Divergências: recolhidas, com o total */}
      {resumo && resumo.divergenciasTotal > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[#f5c2c7] bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 bg-[#fdecee] px-5 py-3 text-left"
            onClick={() => setVerDivergencias((v) => !v)}
            aria-expanded={verDivergencias}
          >
            <span className="text-[14px] font-bold text-[#8f1d14]">
              {resumo.divergenciasTotal}{' '}
              {resumo.divergenciasTotal === 1
                ? 'divergência para conferir'
                : 'divergências para conferir'}
              <span className="ml-2 font-normal text-[#b42318]">
                o Mercado Pago reteve valor diferente do calculado
              </span>
            </span>
            <span className="text-sm font-semibold text-[#8f1d14]">
              {verDivergencias ? 'Esconder' : 'Ver'}
            </span>
          </button>
          {verDivergencias ? (
            <div className="px-5 pb-4">
              <ul className="divide-y divide-line">
                {(divergencias?.itens ?? []).map((d) => (
                  <li
                    key={d.orderId}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <span className="min-w-0">
                      <strong>{d.loja}</strong> · pedido #{d.orderNumber}
                      <span className="block text-xs text-muted">
                        {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                        {d.mpPaymentId ? ` · pagamento ${d.mpPaymentId}` : ''} ·
                        esperado {reais(d.esperadoCents)}, retido{' '}
                        {reais(d.retidoCents)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost h-8 px-3 text-[12px]"
                      onClick={() => void resolver(d.orderId)}
                    >
                      Marcar conferida
                    </button>
                  </li>
                ))}
              </ul>
              {divergencias ? (
                <PaginationBar
                  page={divergencias.pagina}
                  totalPages={divergencias.totalPaginas}
                  total={divergencias.total}
                  label="divergências"
                  onPageChange={setPaginaDiv}
                />
              ) : (
                <p className="py-3 text-sm text-muted">Carregando…</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Por loja */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 pt-4">
          <div className="flex gap-1" role="tablist" aria-label="Quais lojas">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => {
                  setFiltro(f.id);
                  setPagina(1);
                }}
                className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold ${
                  filtro === f.id
                    ? 'border-[var(--brand-deep)] text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {f.rotulo}
                {f.id === 'movimento' && resumo ? (
                  <span className="ml-1.5 rounded-full bg-[#f1f2f4] px-1.5 py-0.5 text-[11px] tabular-nums text-[#4a5560]">
                    {resumo.lojasComMovimento}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              type="search"
              className="field h-9 w-56 text-[13px]"
              placeholder="Buscar loja ou CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar loja"
            />
            <select
              className="field h-9 w-auto text-[13px]"
              value={ordem}
              onChange={(e) => {
                setOrdem(e.target.value as Ordem);
                setPagina(1);
              }}
              aria-label="Ordenar por"
            >
              <option value="liquido">Maior comissão</option>
              <option value="vendas">Mais vendas</option>
              <option value="nome">Nome (A–Z)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className={`w-full min-w-[820px] text-sm transition-opacity ${
              carregandoLojas && lojas ? 'opacity-60' : ''
            }`}
            aria-busy={carregandoLojas}
          >
            <thead className="bg-[#f7f8fa] text-left text-[12px] font-semibold text-muted">
              <tr>
                <th className="px-5 py-2.5">Loja</th>
                <th className="px-3 py-2.5">Taxa</th>
                <th className="px-3 py-2.5">Mercado Pago</th>
                <th className="px-3 py-2.5 text-right">Vendas</th>
                <th className="px-3 py-2.5 text-right">Cobrado</th>
                <th className="px-3 py-2.5 text-right">Devolvido</th>
                <th className="px-3 py-2.5 text-right">Líquido</th>
                <th className="px-5 py-2.5">Cobrança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!lojas && carregandoLojas
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-5 py-3">
                        <div className="h-5 animate-pulse rounded bg-[#f1f2f4]" />
                      </td>
                    </tr>
                  ))
                : null}
              {(lojas?.itens ?? []).map((l) => (
                <tr key={l.storeId} className="hover:bg-[#fafbfc]">
                  <td className="px-5 py-2.5">
                    <p className="font-semibold">{l.nome}</p>
                    <p className="text-xs text-muted">
                      /{l.slug} · {l.plano}
                    </p>
                  </td>
                  <td className="px-3 tabular-nums">
                    {l.feeBps ? pct(l.feeBps) : '—'}
                  </td>
                  <td className="px-3">
                    {l.conectado ? (
                      <Selo tom="ok">Conectado</Selo>
                    ) : (
                      <Selo tom="alerta">Não conectado</Selo>
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {l.pedidos.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {reais(l.cobradoCents)}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {l.devolvidoCents ? reais(l.devolvidoCents) : '—'}
                  </td>
                  <td className="px-3 text-right font-semibold tabular-nums">
                    {reais(l.liquidoCents)}
                  </td>
                  <td className="px-5">
                    <select
                      className="field h-8 w-auto text-[12px]"
                      value={l.liberacao}
                      onChange={(e) =>
                        void mudarLiberacao(l, e.target.value as Liberacao)
                      }
                      aria-label={`Cobrança da loja ${l.nome}`}
                    >
                      <option value="geral">
                        Segue o geral (
                        {resumo?.geral.ligadaNoGeral ? 'ligada' : 'desligada'})
                      </option>
                      <option value="ligada">Ligada</option>
                      <option value="desligada">Desligada</option>
                    </select>
                  </td>
                </tr>
              ))}
              {lojas && lojas.itens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted">
                    {buscaAplicada
                      ? `Nenhuma loja encontrada para "${buscaAplicada}".`
                      : filtro === 'movimento'
                        ? 'Nenhuma loja teve comissão neste mês.'
                        : 'Nenhuma loja neste filtro.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {lojas && lojas.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-xs text-muted">
              {primeira.toLocaleString('pt-BR')}–
              {ultima.toLocaleString('pt-BR')} de{' '}
              {lojas.total.toLocaleString('pt-BR')}{' '}
              {lojas.total === 1 ? 'loja' : 'lojas'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Por página
                <select
                  className="field h-8 w-auto text-[12px]"
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value));
                    setPagina(1);
                  }}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <PaginationBar
                className="border-t-0 pt-0"
                page={lojas.pagina}
                totalPages={lojas.totalPaginas}
                onPageChange={(p) => {
                  setPagina(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
