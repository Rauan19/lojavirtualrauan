'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, money } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { PaginationBar } from '@/components/PaginationBar';
import { CabecalhoPagina, EstadoVazio, Selo } from '@/components/admin/Pagina';

type Carrinho = {
  id: string;
  orderNumber: string;
  abandonadoEm: string;
  emailEnviadoEm: string | null;
  cliente: string;
  email: string;
  telefone: string | null;
  total: number;
  itens: { nome: string; quantidade: number }[];
  recuperadoNoPedido: string | null;
  link: string;
};

type Situacao = 'todos' | 'pendentes' | 'recuperados' | 'sem-lembrete';

type Resposta = {
  emailAutomatico: boolean;
  dias: number;
  resumo: {
    total: number;
    recuperados: number;
    taxa: number;
    valorEmAberto: number;
    valorRecuperado: number;
  };
  contagens: {
    todos: number;
    pendentes: number;
    recuperados: number;
    semLembrete: number;
  };
  carrinhos: Carrinho[];
  paginacao: {
    total: number;
    pagina: number;
    porPagina: number;
    totalPaginas: number;
  };
};

const PERIODOS = [7, 30, 90] as const;

const ABAS: {
  id: Situacao;
  rotulo: string;
  conta: keyof Resposta['contagens'];
}[] = [
  { id: 'todos', rotulo: 'Todos', conta: 'todos' },
  { id: 'pendentes', rotulo: 'Pendentes', conta: 'pendentes' },
  { id: 'recuperados', rotulo: 'Recuperados', conta: 'recuperados' },
  { id: 'sem-lembrete', rotulo: 'Sem lembrete', conta: 'semLembrete' },
];

function opcoes() {
  const user = getUser();
  return { token: getToken(), storeSlug: user?.store?.slug };
}

function quando(iso: string) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias === 0)
    return `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** Link do WhatsApp com a mensagem pronta (o lojista só aperta enviar). */
function linkWhatsapp(c: Carrinho, loja: string) {
  const digitos = (c.telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
  const nome = c.cliente.trim().split(/\s+/)[0] || '';
  const texto = `Olá${nome ? `, ${nome}` : ''}! Aqui é da ${loja}. Vi que você não finalizou sua compra e separei seus itens de novo. É só tocar no link para concluir: ${c.link}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Estado da tela na URL: dá para recarregar sem perder o filtro. */
function lerUrl() {
  const q = new URLSearchParams(window.location.search);
  const dias = Number(q.get('dias'));
  const situacao = q.get('situacao') as Situacao | null;
  const porPagina = Number(q.get('porPagina'));
  return {
    dias: PERIODOS.includes(dias as never) ? dias : 30,
    situacao:
      situacao && ABAS.some((a) => a.id === situacao) ? situacao : 'todos',
    busca: q.get('busca') ?? '',
    pagina: Math.max(1, Number(q.get('pagina')) || 1),
    porPagina: [20, 50, 100].includes(porPagina) ? porPagina : 20,
  };
}

export default function CarrinhosAbandonadosPage() {
  const [pronto, setPronto] = useState(false);
  const [dias, setDias] = useState(30);
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [loja, setLoja] = useState('loja');

  useEffect(() => {
    const u = lerUrl();
    setDias(u.dias);
    setSituacao(u.situacao);
    setBusca(u.busca);
    setBuscaAplicada(u.busca);
    setPagina(u.pagina);
    setPorPagina(u.porPagina);
    setLoja(getUser()?.store?.name || 'loja');
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

  useEffect(() => {
    if (!pronto) return;
    const q = new URLSearchParams();
    if (dias !== 30) q.set('dias', String(dias));
    if (situacao !== 'todos') q.set('situacao', situacao);
    if (buscaAplicada) q.set('busca', buscaAplicada);
    if (pagina > 1) q.set('pagina', String(pagina));
    if (porPagina !== 20) q.set('porPagina', String(porPagina));
    const qs = q.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    );
  }, [pronto, dias, situacao, buscaAplicada, pagina, porPagina]);

  // Só a resposta do último pedido vale (digitar rápido não embaralha)
  const pedidoAtual = useRef(0);
  const carregar = useCallback(async () => {
    const n = ++pedidoAtual.current;
    setCarregando(true);
    const q = new URLSearchParams({
      dias: String(dias),
      situacao,
      pagina: String(pagina),
      porPagina: String(porPagina),
    });
    if (buscaAplicada) q.set('busca', buscaAplicada);
    try {
      const r = await api<Resposta>(
        `/admin/carrinhos-abandonados?${q}`,
        opcoes(),
      );
      if (n !== pedidoAtual.current) return;
      setDados(r);
      setErro('');
      if (r.paginacao.pagina !== pagina) setPagina(r.paginacao.pagina);
    } catch (e) {
      if (n === pedidoAtual.current)
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    } finally {
      if (n === pedidoAtual.current) setCarregando(false);
    }
  }, [dias, situacao, pagina, porPagina, buscaAplicada]);

  useEffect(() => {
    if (pronto) void carregar();
  }, [pronto, carregar]);

  async function alternarEmail(ligado: boolean) {
    if (!dados) return;
    setSalvando(true);
    try {
      await api('/admin/carrinhos-abandonados/config', {
        method: 'PATCH',
        body: { emailAutomatico: ligado },
        ...opcoes(),
      });
      setDados({ ...dados, emailAutomatico: ligado });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function copiar(c: Carrinho) {
    try {
      await navigator.clipboard.writeText(c.link);
      setCopiado(c.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  const r = dados?.resumo;
  const pg = dados?.paginacao;
  const primeira = pg ? (pg.pagina - 1) * pg.porPagina + 1 : 0;
  const ultima = pg && dados ? primeira + dados.carrinhos.length - 1 : 0;
  const semNada = dados && dados.resumo.total === 0;

  return (
    <div className="admin-page max-w-5xl">
      <CabecalhoPagina
        icone="/admin/carrinhos-abandonados"
        titulo="Carrinhos abandonados"
        descricao="Clientes que chegaram ao pagamento e não pagaram. O pedido expira em 1 hora e os itens voltam para o estoque; aqui você chama o cliente de volta."
        acoes={
          <div
            className="flex rounded-lg border border-line bg-white p-0.5"
            role="group"
            aria-label="Período"
          >
            {PERIODOS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dias === d}
                onClick={() => {
                  setDias(d);
                  setPagina(1);
                }}
                className={`h-8 rounded-md px-3 text-[13px] font-semibold ${
                  dias === d
                    ? 'bg-[var(--brand-deep)] text-white'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {d} dias
              </button>
            ))}
          </div>
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

      {/* Resumo do período */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            [
              'Abandonados',
              r ? r.total.toLocaleString('pt-BR') : '…',
              `nos últimos ${dias} dias`,
              '',
            ],
            [
              'Parado em carrinhos',
              r ? money(r.valorEmAberto) : '…',
              'de quem ainda não voltou',
              '',
            ],
            [
              'Recuperados',
              r ? r.recuperados.toLocaleString('pt-BR') : '…',
              r ? `${r.taxa}% voltaram e compraram` : ' ',
              'text-[var(--ok)]',
            ],
            [
              'Valor que voltou',
              r ? money(r.valorRecuperado) : '…',
              'em compras de quem voltou',
              'text-[var(--ok)]',
            ],
          ] as const
        ).map(([rotulo, valor, detalhe, cor]) => (
          <div
            key={rotulo}
            className="rounded-2xl border border-line bg-white px-5 py-4"
          >
            <p className="text-[13px] font-medium text-muted">{rotulo}</p>
            <p
              className={`mt-1 text-[1.45rem] font-bold leading-tight tabular-nums ${cor}`}
            >
              {valor}
            </p>
            <p className="mt-1 text-xs text-muted">{detalhe}</p>
          </div>
        ))}
      </section>

      {dados ? (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-3.5">
          <span className="text-sm">
            <strong className="block text-[14px]">
              Lembrete automático por e-mail
            </strong>
            <span className="text-muted">
              Um e-mail só, assim que o pedido expira, com um botão que devolve
              os itens à sacola do cliente.
            </span>
          </span>
          <span className="relative inline-flex shrink-0">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={dados.emailAutomatico}
              disabled={salvando}
              onChange={(e) => void alternarEmail(e.target.checked)}
            />
            <span className="h-7 w-12 rounded-full bg-[#d5dade] transition-colors peer-checked:bg-[var(--brand-deep)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-teal)] peer-disabled:opacity-60" />
            <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 pt-3">
          <div
            className="flex flex-wrap gap-x-1"
            role="tablist"
            aria-label="Situação"
          >
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={situacao === a.id}
                onClick={() => {
                  setSituacao(a.id);
                  setPagina(1);
                }}
                className={`-mb-px shrink-0 border-b-2 px-3 pb-3 pt-1 text-sm font-semibold ${
                  situacao === a.id
                    ? 'border-[var(--brand-deep)] text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {a.rotulo}
                {dados ? (
                  <span className="ml-1.5 rounded-full bg-[#f1f2f4] px-1.5 py-0.5 text-[11px] tabular-nums text-[#4a5560]">
                    {dados.contagens[a.conta]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="field mb-3 h-9 w-full text-[13px] sm:w-64"
            placeholder="Nome, e-mail, telefone ou pedido"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar carrinho"
          />
        </div>

        {!dados && carregando ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-[#f1f2f4]"
              />
            ))}
          </div>
        ) : semNada ? (
          <EstadoVazio
            icone="/admin/carrinhos-abandonados"
            titulo="Nenhum carrinho abandonado"
            texto={`Nos últimos ${dias} dias ninguém deixou de pagar. Quando acontecer, o pedido aparece aqui para você chamar o cliente.`}
          />
        ) : dados && dados.carrinhos.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            {buscaAplicada
              ? `Nenhum carrinho encontrado para "${buscaAplicada}".`
              : 'Nenhum carrinho nesta situação.'}
          </p>
        ) : (
          <ul
            className={`divide-y divide-line transition-opacity ${
              carregando ? 'opacity-60' : ''
            }`}
            aria-busy={carregando}
          >
            {(dados?.carrinhos ?? []).map((c) => {
              const wa = linkWhatsapp(c, loja);
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {c.cliente}{' '}
                        <span className="font-normal text-muted">
                          · {money(c.total)} · pedido #{c.orderNumber}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {c.email}
                        {c.telefone ? ` · ${c.telefone}` : ''} · abandonado{' '}
                        {quando(c.abandonadoEm)}
                      </p>
                      <p className="mt-1 text-sm">
                        {c.itens
                          .map((i) => `${i.quantidade}× ${i.nome}`)
                          .join(', ')}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {c.recuperadoNoPedido ? (
                          <Selo tom="ok">
                            Recuperado · pedido #{c.recuperadoNoPedido}
                          </Selo>
                        ) : null}
                        <Selo tom={c.emailEnviadoEm ? 'neutro' : 'alerta'}>
                          {c.emailEnviadoEm
                            ? 'E-mail enviado'
                            : 'E-mail não enviado'}
                        </Selo>
                      </p>
                    </div>
                    {!c.recuperadoNoPedido ? (
                      <div className="flex flex-wrap gap-2">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-accent h-9 px-3 text-[13px]"
                          >
                            Chamar no WhatsApp
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost h-9 px-3 text-[13px]"
                          onClick={() => void copiar(c)}
                        >
                          {copiado === c.id ? 'Link copiado' : 'Copiar link'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {pg && pg.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-xs text-muted">
              {primeira.toLocaleString('pt-BR')}–
              {ultima.toLocaleString('pt-BR')} de{' '}
              {pg.total.toLocaleString('pt-BR')}{' '}
              {pg.total === 1 ? 'carrinho' : 'carrinhos'}
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
                  {[20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <PaginationBar
                className="border-t-0 pt-0"
                page={pg.pagina}
                totalPages={pg.totalPaginas}
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
